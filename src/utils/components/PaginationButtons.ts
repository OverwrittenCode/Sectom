import {
	ButtonInteraction,
	Colors,
	EmbedBuilder,
	GuildMember
} from "discord.js";

import { CasesModel } from "../../models/Moderation/Cases.js";
import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "../config.js";
import { ValidationError } from "../errors/ValidationError.js";
import {
	getEntityFromGuild,
	getMentionPrefixFromEntity
} from "../interaction.js";
import type { TargetType } from "../ts/Access.js";
import { AccessListBarrier } from "../ts/Access.js";

export async function ButtonComponentMoveSnowflake(
	interaction: ButtonInteraction
) {
	if (!interaction.guild || !interaction.guildId)
		throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

	const cases = await CasesModel.findByServerId(interaction.guildId);
	if (!cases) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

	await interaction.deferReply({ ephemeral: true });

	const fetchedMessage = interaction.message;
	const confirmationEmbed = fetchedMessage.embeds[0];
	const messageContentArray = confirmationEmbed.description!.split(" ");
	const footerWordArr = confirmationEmbed.footer!.text.split(" ");

	let commandName: string | undefined;

	if (messageContentArray.indexOf("guild") == -1)
		commandName =
			messageContentArray[messageContentArray.indexOf("database") - 1];

	const targetTypeStr = footerWordArr[0] as TargetType;
	const targetGuildPropertyStr =
		targetTypeStr == "User"
			? "members"
			: (`${targetTypeStr.toLowerCase()}s` as "roles" | "channels");

	const targetId = confirmationEmbed.footer?.text?.split(" ").at(-1);
	if (!targetId) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

	const target = await getEntityFromGuild(
		interaction,
		[targetGuildPropertyStr],
		targetId,
		true
	);

	if (!target) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

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

	await interaction.editReply({
		embeds: [confirmedEmbed],
		components: []
	});
}
