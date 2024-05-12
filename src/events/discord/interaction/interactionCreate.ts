import assert from "assert";

import { AutocompleteInteraction, Colors, ComponentType, EmbedBuilder } from "discord.js";
import { Discord, On } from "discordx";
import { container, injectable } from "tsyringe";

import { Beans } from "~/framework/DI/Beans.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { DBConnectionManager } from "~/managers/DBConnectionManager.js";
import { RedisCache } from "~/models/DB/cache/index.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { StringUtils } from "~/utils/string.js";

import type { ArgsOf, Client } from "discordx";

@Discord()
@injectable()
export class InteractionCreate {
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
						id: interaction.guildId
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

			await interaction.deferUpdate();
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

		const end = Date.now();

		const timeElapsed = end - start;
		const setTimeoutDelay = MAX_DEFER_RESPONSE_WAIT - timeElapsed;

		const autoDeferInteractionPromise = new Promise<"OK">((resolve) => {
			if (interaction.isChatInputCommand()) {
				this.sleep(setTimeoutDelay).then(() => {
					if (!interaction.replied && !interaction.deferred) {
						interaction
							.deferReply()
							.catch(() => {})
							.then(() => {
								resolve("OK");
							});
					}
				});
			}
		});

		try {
			await Promise.all([bot.executeInteraction(interaction), autoDeferInteractionPromise]);
		} catch (err) {
			if (err instanceof ValidationError && !(interaction instanceof AutocompleteInteraction)) {
				return await InteractionUtils.replyOrFollowUp(interaction, {
					content: `Validation Error: ${err.message}`,
					ephemeral: true
				});
			}

			throw err;
		}
	}

	private sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
