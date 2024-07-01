import assert from "assert";

import { AutocompleteInteraction, Events } from "discord.js";
import { Discord, On } from "discordx";
import { container } from "tsyringe";

import { MAX_DEFER_RESPONSE_WAIT } from "~/constants";
import { Beans } from "~/framework/DI/Beans.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { StringUtils } from "~/utils/string.js";

import type { ArgsOf, Client } from "discordx";

@Discord()
export abstract class InteractionCreate {
	@On({ event: Events.InteractionCreate })
	async interactionCreate([interaction]: ArgsOf<Events.InteractionCreate>) {
		assert(interaction.inCachedGuild());

		await DBConnectionManager.Prisma.guild.fetchValidConfiguration({ guildId: interaction.guildId });

		if (interaction.isButton() || interaction.isStringSelectMenu()) {
			const messageComponentIds = InteractionUtils.MessageComponentIds;

			const isPaginationButton = messageComponentIds.Managed.some((str) =>
				interaction.customId.toLowerCase().includes(str)
			);

			if (isPaginationButton) {
				return;
			}

			const disableOnClickButtonArray = [
				messageComponentIds.CancelAction,
				messageComponentIds.ConfirmAction,
				messageComponentIds.OneTimeUse
			];

			const customIDFields = interaction.customId.split(StringUtils.CustomIDFIeldBodySeperator);
			const disableOnClick = customIDFields.some((str) => disableOnClickButtonArray.includes(str));

			if (disableOnClick) {
				const { customId, message, replied, deferred } = interaction;

				const isCancel = customId === messageComponentIds.CancelAction;
				const isConfirmAction = customId === messageComponentIds.ConfirmAction;

				const options = isCancel ? { content: "Action cancelled.", embeds: [] } : {};

				if (message.editable) {
					await InteractionUtils.disableComponents(message, options);
				} else {
					await InteractionUtils.replyOrFollowUp(interaction, options);
				}

				if (!replied && !deferred) {
					await interaction.deferUpdate().catch(() => {});
				}

				if (isCancel || isConfirmAction) {
					return;
				}
			}
		}

		const bot = container.resolve<Client>(Beans.ISectomToken);

		try {
			await Promise.all([
				this.autoDeferInteraction(interaction, Date.now() - interaction.createdTimestamp),
				bot.executeInteraction(interaction)
			]);
		} catch (err) {
			if (err instanceof ValidationError && !(interaction instanceof AutocompleteInteraction)) {
				return await InteractionUtils.replyOrFollowUp(interaction, {
					content: err.message,
					ephemeral: true
				});
			}

			throw err;
		}
	}

	private async autoDeferInteraction(interaction: Typings.CachedGuildInteraction, timeElapsed: number) {
		if (interaction.isModalSubmit()) {
			return await InteractionUtils.deferInteraction(interaction, true);
		}

		const isDeferrableInteraction =
			interaction.isChatInputCommand() ||
			(interaction.isMessageComponent() && !interaction.customId.includes(Enums.MessageComponentType.Modal));

		if (!isDeferrableInteraction) {
			return null;
		}

		const setTimeoutDelay = MAX_DEFER_RESPONSE_WAIT - timeElapsed;

		await new Promise((resolve) => setTimeout(resolve, setTimeoutDelay));

		return await InteractionUtils.deferInteraction(interaction);
	}
}
