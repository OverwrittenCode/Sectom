import {
	Category,
	// Category,
	RateLimit,
	TIME_UNIT
} from "@discordx/utilities";
import type {
	ButtonInteraction,
	ChatInputCommandInteraction,
	CommandInteraction
} from "discord.js";
import {
	ApplicationCommandOptionType,
	Colors,
	EmbedBuilder,
	GuildMember
} from "discord.js";
import {
	ButtonComponent,
	Discord,
	Guard,
	Slash,
	SlashGroup,
	SlashOption
} from "discordx";

import { RedisCache } from "../../DB/cache/index.js";
import { CasesModel } from "../../DB/models/Moderation/Cases.js";
import { capitalizeFirstLetter, concatenate } from "../../utils/casing.js";
import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "../../utils/config.js";
import { ValidationError } from "../../utils/errors/ValidationError.js";
import {
	getEntityFromGuild,
	getMentionPrefixFromEntity,
	replyOrFollowUp
} from "../../utils/interaction.js";
import { moderationHierarchy } from "../../utils/moderationHierarchy.js";
import type {
	AccessGateSubGroupApplicationCommandOptionType,
	AccessListBarrier,
	SubCommandActionType,
	TargetType
} from "../../utils/ts/Access.js";
import { ListType } from "../../utils/ts/Enums.js";

const { cases } = RedisCache;

enum SubCommandType {
	USER = "user",
	ROLE = "role",
	CHANNEL = "channel"
}

const GuardDecorator = (() =>
	Guard(RateLimit(TIME_UNIT.seconds, 3, { ephemeral: true })))();

createBaseListManagerClass("blacklist");
createBaseListManagerClass("whitelist");
createSubCommandManagerClass("blacklist", "user");
createSubCommandManagerClass("blacklist", "role");
createSubCommandManagerClass("blacklist", "channel");
createSubCommandManagerClass("whitelist", "user");
createSubCommandManagerClass("whitelist", "role");
createSubCommandManagerClass("whitelist", "channel");

function createBaseListManagerClass(list: `${ListType}`) {
	@Discord()
	@Category("Admin Commands")
	@SlashGroup({
		description: `Manage ${list} for the guild or in a specific command`,
		name: list
	})
	@SlashGroup(list)
	class BaseListManager {
		@Slash({ description: `View the ${list}`, name: "view" })
		@GuardDecorator
		async view(
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			if (!interaction.guild || !interaction.guildId) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}

			const cachedCasesDocument = await cases.getByServerId(interaction);

			await cases.PaginateData(cachedCasesDocument, {
				interaction,
				caseType: list,
				searchFilter: ["all"],
				commandName
			});
		}
	}

	return BaseListManager;
}

function createSubCommandManagerClass(
	root: `${ListType}`,
	subCommandType: `${SubCommandType}`
) {
	const description = concatenate(
		capitalizeFirstLetter(subCommandType),
		capitalizeFirstLetter(root)
	);

	const targetTypeNumber =
		ApplicationCommandOptionType[capitalizeFirstLetter(subCommandType)];

	@Discord()
	@SlashGroup({
		description,
		name: subCommandType,
		root
	})
	@SlashGroup(subCommandType, root)
	class SubCommandManager {
		async manageSubCommandAction(
			action: `${SubCommandActionType}`,
			target: AccessGateSubGroupApplicationCommandOptionType,
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			const cachedCasesDocument = await cases.getByServerId(interaction);
			const guildMemberOrRole = await getEntityFromGuild(
				interaction,
				["members", "roles"],
				target.id,
				true
			);
			if (guildMemberOrRole) {
				const fairCheck = await moderationHierarchy(
					guildMemberOrRole,
					interaction
				);
				if (fairCheck) {
					return replyOrFollowUp(interaction, {
						content: fairCheck,
						ephemeral: true
					});
				}
			}
			const CasesDB = await CasesModel.findById(cachedCasesDocument._id);
			if (!CasesDB) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}
			CasesDB[root].applicationModifySelection({
				type: target,
				commandName,
				interaction,
				action
			});
		}

		@ButtonComponent({ id: `${root}_${subCommandType}_move_target` })
		async moveSubCommandType(interaction: ButtonInteraction) {
			if (!interaction.guild || !interaction.guildId) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}

			const cases = await CasesModel.findByServerId(interaction.guildId);
			if (!cases) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}

			await interaction.deferReply({ ephemeral: true });

			const fetchedMessage = interaction.message;
			const confirmationEmbed = fetchedMessage.embeds[0];
			const messageContentArray = confirmationEmbed.description!.split(" ");
			const footerWordArr = confirmationEmbed.footer!.text.split(" ");

			let commandName: string | undefined;

			if (messageContentArray.indexOf("guild") == -1) {
				commandName =
					messageContentArray[messageContentArray.indexOf("database") - 1];
			}

			const targetTypeStr = footerWordArr[0] as TargetType;
			const targetGuildPropertyStr =
				targetTypeStr == "User"
					? "members"
					: (`${targetTypeStr.toLowerCase()}s` as "roles" | "channels");

			const targetId = confirmationEmbed.footer?.text?.split(" ").at(-1);
			if (!targetId) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}

			const target = await getEntityFromGuild(
				interaction,
				[targetGuildPropertyStr],
				targetId,
				true
			);
			if (!target) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}

			const type = target instanceof GuildMember ? target.user : target;
			const mentionPrefix = getMentionPrefixFromEntity(target);
			const targetMention = `<${mentionPrefix}${targetId}>`;
			const list = messageContentArray
				.pop()
				?.slice(0, -1) as `${AccessListBarrier}`;

			const listInstance = cases[list];

			const oppositeList = list === "whitelist" ? "blacklist" : "whitelist";
			const oppositeListInstance = cases[oppositeList];
			await oppositeListInstance.applicationModifySelection({
				type,
				interaction,
				action: "remove",
				commandName,
				transfering: true
			});

			await listInstance.applicationModifySelection({
				type,
				interaction,
				action: "add",
				commandName,
				transfering: true
			});

			const confirmedEmbed = new EmbedBuilder()
				.setTitle("Success")
				.setDescription(
					`${targetMention} has been moved from the ${oppositeList} to the ${list} ${
						commandName ?? "guild"
					}`
				)
				.setColor(Colors.Green)
				.setAuthor(confirmationEmbed.author)
				.setFooter(confirmationEmbed.footer)
				.setTimestamp();

			await replyOrFollowUp(interaction, {
				embeds: [confirmedEmbed],
				components: []
			});
		}
		@Slash({
			description: `Add a ${subCommandType} to the ${root}`,
			name: "add"
		})
		@GuardDecorator
		async add(
			@SlashOption({
				name: "target",
				type: targetTypeNumber,
				required: true,
				description: `Add a ${subCommandType} to the ${root}`
			})
			target: AccessGateSubGroupApplicationCommandOptionType,
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			await this.manageSubCommandAction(
				"add",
				target,
				commandName,
				interaction
			);
		}

		@Slash({
			description: `Remove a ${subCommandType} from the ${root}`,
			name: "remove"
		})
		@GuardDecorator
		async remove(
			@SlashOption({
				name: "target",
				type: targetTypeNumber,
				required: true,
				description: `Remove a ${subCommandType} from the ${root}`
			})
			target: AccessGateSubGroupApplicationCommandOptionType,
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: ChatInputCommandInteraction
		) {
			await this.manageSubCommandAction(
				"remove",
				target,
				commandName,
				interaction
			);
		}

		@Slash({
			description: `View the ${subCommandType} ${root}`,
			name: "view"
		})
		@GuardDecorator
		async view(
			@SlashOption({
				description: "The command name",
				name: "command",
				type: ApplicationCommandOptionType.String
			})
			commandName: string | undefined,
			interaction: CommandInteraction
		) {
			if (!interaction.guild || !interaction.guildId) {
				throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
			}
			const cachedCasesDocument = await cases.getByServerId(interaction);

			await cases.PaginateData(cachedCasesDocument, {
				interaction,
				caseType: root,
				searchFilter: [`${subCommandType}s`],
				commandName
			});
		}
	}

	return SubCommandManager;
}
