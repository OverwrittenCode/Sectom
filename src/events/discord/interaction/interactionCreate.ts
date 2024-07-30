import assert from "assert";

import { AutocompleteInteraction, Events } from "discord.js";
import { Discord, On } from "discordx";
import { container } from "tsyringe";

import { MAX_DEFER_RESPONSE_WAIT } from "~/constants";
import { Beans } from "~/framework/DI/Beans.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type { ArgsOf, Client } from "discordx";

@Discord()
export abstract class InteractionCreate {
	@On({ event: Events.InteractionCreate })
	public async interactionCreate([interaction]: ArgsOf<Events.InteractionCreate>) {
		assert(interaction.inCachedGuild());

		const hasRecievedTooLate = Date.now() > interaction.createdTimestamp + MAX_DEFER_RESPONSE_WAIT;

		if (hasRecievedTooLate) {
			return;
		}

		if (interaction.isButton() || interaction.isStringSelectMenu()) {
			const messageComponentIds = InteractionUtils.MessageComponentIds;

			const isPaginationButton = messageComponentIds.Managed.some((str) =>
				interaction.customId.toLowerCase().includes(str)
			);

			if (isPaginationButton) {
				return;
			}

			const disableOnClickButtonArr = [
				messageComponentIds.CancelAction,
				messageComponentIds.ConfirmAction,
				messageComponentIds.OneTimeUse
			];

			const customIDFields = interaction.customId.split(StringUtils.CustomIDFIeldBodySeperator);
			const disableOnClick = customIDFields.some((str) => disableOnClickButtonArr.includes(str));

			if (disableOnClick) {
				const isCancelAction = interaction.customId.startsWith(messageComponentIds.CancelAction);

				if (isCancelAction) {
					await InteractionUtils.disableComponents(interaction.message, {
						messageEditOptions: {
							embeds: [],
							content: ValidationError.MessageTemplates.ActionCancelled
						}
					});

					return await InteractionUtils.deferInteraction(interaction, true);
				}

				if (
					!interaction.ephemeral &&
					!interaction.customId.includes(InteractionUtils.MessageComponentIds.Multiplayer)
				) {
					await InteractionUtils.disableComponents(interaction.message, {
						rules: {
							customIds: disableOnClickButtonArr
						}
					});
				}
			}

			await this.autoDeferInteraction(interaction, Date.now() - interaction.createdTimestamp);
		}

		const bot = container.resolve<Client>(Beans.ISectomToken);

		try {
			await Promise.all([
				this.autoDeferInteraction(interaction, Date.now() - interaction.createdTimestamp),
				bot.executeInteraction(interaction)
			]);
		} catch (err) {
			if (InteractionUtils.isPermissionError(err)) {
				return;
			}

			if (err instanceof ValidationError && !(interaction instanceof AutocompleteInteraction)) {
				if (
					err.message === ValidationError.MessageTemplates.ActionCancelled ||
					err.message === ValidationError.MessageTemplates.Timeout
				) {
					return;
				}

				return await InteractionUtils.replyOrFollowUp(interaction, {
					content: err.message,
					ephemeral: true
				});
			}

			throw err;
		}
	}

	private async autoDeferInteraction(interaction: Typings.CachedGuildInteraction, timeElapsed: number) {
		const setTimeoutDelay = MAX_DEFER_RESPONSE_WAIT - timeElapsed;

		const isUpdatable = interaction.isMessageComponent();

		const isSafeComponent = isUpdatable && !interaction.customId.includes(Enums.MessageComponentType.Modal);

		if (interaction.isModalSubmit() || isSafeComponent) {
			return await InteractionUtils.deferInteraction(interaction, true);
		}

		const isDeferrableInteraction = interaction.isChatInputCommand() || isSafeComponent;

		if (!isDeferrableInteraction) {
			return null;
		}

		await ObjectUtils.sleep(setTimeoutDelay);

		return await InteractionUtils.deferInteraction(interaction, isUpdatable);
	}
}
