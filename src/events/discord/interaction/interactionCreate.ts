import assert from "assert";

import { AutocompleteInteraction } from "discord.js";
import { Discord, On } from "discordx";
import { container } from "tsyringe";

import { MAX_DEFER_RESPONSE_WAIT } from "~/constants";
import { Beans } from "~/framework/DI/Beans.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { StringUtils } from "~/utils/string.js";

import type { ArgsOf, Client } from "discordx";

@Discord()
export abstract class InteractionCreate {
	@On({ event: "interactionCreate" })
	async interactionCreate([interaction]: ArgsOf<"interactionCreate">) {
		const start = Date.now();

		assert(interaction.inCachedGuild());

		const isCacheHit = await RedisCache.guild.collection.get(interaction.guildId).then(Boolean);

		if (!isCacheHit) {
			const guildRecord = await DBConnectionManager.Prisma.guild.findUnique({
				where: {
					id: interaction.guildId
				}
			});

			if (!guildRecord) {
				await DBConnectionManager.Prisma.guild.create({
					data: {
						id: interaction.guildId,
						configuration: DBConnectionManager.Defaults.Configuration
					},
					select: {
						id: true
					}
				});
			} else {
				await RedisCache.guild.collection.set(interaction.guildId, guildRecord);
			}
		}

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
				const isCancel = interaction.customId === messageComponentIds.CancelAction;
				const isConfirmAction = interaction.customId === messageComponentIds.ConfirmAction;

				const buttonMessage = interaction.message;

				const options = isCancel ? { content: "Action cancelled.", embeds: [] } : {};

				if (buttonMessage.editable) {
					await InteractionUtils.disableComponents(buttonMessage, options);
				} else {
					await InteractionUtils.replyOrFollowUp(interaction, options);
				}

				if (!interaction.replied && !interaction.deferred) {
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
				this.autoDeferInteraction(interaction, Date.now() - start),
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
			return await interaction.deferReply({ ephemeral: true }).catch(() => {});
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
