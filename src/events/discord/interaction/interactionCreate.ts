import assert from "assert";

import {
	BUTTON_SUFFIX_CANCEL_ACTION,
	BUTTON_SUFFIX_CONFIRMATION_ARRAY,
	INTERACTION,
	MAX_DEFER_RESPONSE_WAIT
} from "@constants";
import { Beans } from "@framework/DI/Beans.js";
import { ValidationError } from "@helpers/errors/ValidationError.js";
import { DBConnectionManager } from "@managers/DBConnectionManager.js";
import { RedisCache } from "@models/DB/cache/index.js";
import { InteractionUtils } from "@utils/interaction.js";
import type { APIActionRowComponent, APIButtonComponent } from "discord.js";
import { AutocompleteInteraction, Colors, ComponentType, EmbedBuilder } from "discord.js";
import type { ArgsOf, Client } from "discordx";
import { Discord, On } from "discordx";
import { container, injectable } from "tsyringe";

const {
	ID: {
		CANCEL_ACTION,
		EXTERNALS: { WILD_CARDS }
	}
} = INTERACTION;

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
			const isPaginationButton = WILD_CARDS.some((str) => interaction.customId.toLowerCase().includes(str));

			if (isPaginationButton) {
				return;
			}

			await interaction.deferUpdate();

			const confirmationArray = BUTTON_SUFFIX_CONFIRMATION_ARRAY;
			const actionButtonSuffix = interaction.customId.split(".").at(-1);
			const isConfirmationButton = !!actionButtonSuffix && confirmationArray.includes(actionButtonSuffix);

			if (isConfirmationButton) {
				const isCancel = actionButtonSuffix === BUTTON_SUFFIX_CANCEL_ACTION;

				const buttonMessage = interaction.message;

				const cancelEmbed = new EmbedBuilder()
					.setColor(Colors.Red)
					.setTitle(CANCEL_ACTION.TITLE)
					.setDescription(CANCEL_ACTION.DESCRIPTION);

				const embeds = isCancel ? [cancelEmbed] : undefined;

				if (buttonMessage.editable) {
					const { components } = buttonMessage;

					const confirmationButtonIndex = components.findIndex((row) =>
						row.components.every((c) => {
							const confirmationSuffix = c.customId?.split(".").at(-1);

							return (
								c.type === ComponentType.Button &&
								confirmationSuffix &&
								confirmationArray.includes(confirmationSuffix)
							);
						})
					);

					assert(confirmationButtonIndex !== -1);

					const confirmationButtonComponent = components[confirmationButtonIndex].toJSON();

					const disabledConfirmationButtons = confirmationButtonComponent.components.map((c) =>
						Object.assign({}, c, { disabled: true })
					) as APIButtonComponent[];

					const disabledComponentObject: APIActionRowComponent<APIButtonComponent> = {
						components: disabledConfirmationButtons,
						type: ComponentType.ActionRow
					};

					const updatedComponents = [
						...components.filter((c, index) => index !== confirmationButtonIndex),
						disabledComponentObject
					];

					await buttonMessage.edit({
						embeds,
						components: updatedComponents
					});
				} else if (embeds) {
					await InteractionUtils.replyOrFollowUp(interaction, { embeds });
				}

				if (isCancel) {
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
