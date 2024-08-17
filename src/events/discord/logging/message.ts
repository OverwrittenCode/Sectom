import { ActionType } from "@prisma/client";
import { ButtonBuilder, ButtonStyle, EmbedBuilder, Events, Message } from "discord.js";
import { ArgsOf, Discord, On } from "discordx";

import { BaseEventLogOptions, DiscordEventLogManager } from "~/models/framework/managers/DiscordEventLogManager.js";
import { Enums } from "~/ts/Enums.js";

@Discord()
export abstract class MessageLog {
	@On({ event: Events.MessageUpdate })
	public async messageUpdate([oldMessage, newMessage]: ArgsOf<Events.MessageUpdate>) {
		if (!(oldMessage.inGuild() && newMessage.inGuild()) || oldMessage.partial || newMessage.partial) {
			return;
		}

		const messageOptions = this.generateMessageOptions(newMessage, Enums.ModifierType.Update);

		return DiscordEventLogManager.updateHandler({
			...messageOptions,
			old: oldMessage,
			new: newMessage,
			actionType: ActionType.DISCORD_MESSAGE_UPDATE,
			options: {
				content: true,
				pinned: true,
				attachments() {
					return {
						focusedKey: "url" as const
					};
				}
			}
		});
	}

	@On({ event: Events.MessageDelete })
	public messageDelete([message]: ArgsOf<Events.MessageDelete>) {
		if (!message.inGuild() || message.partial) {
			return;
		}

		const messageOptions = this.generateMessageOptions(message, Enums.ModifierType.Remove);

		return DiscordEventLogManager.featHandler({
			...messageOptions,
			clazz: message,
			actionType: ActionType.DISCORD_MESSAGE_DELETE,
			options: {
				content: true,
				attachments() {
					return {
						fieldValue: null
					};
				}
			}
		});
	}

	private generateMessageOptions(
		message: Message<true>,
		modifierType: Enums.ModifierType,
		before?: Message<true>
	): Pick<BaseEventLogOptions, "button" | "embeds"> {
		const { author, member, channel, url, id } = message;

		const iconTarget = member ?? author;

		const actionPastTense = DiscordEventLogManager.modifierTypePastTenseMap[modifierType];

		const embed = new EmbedBuilder()
			.setAuthor({
				name: author.username,
				iconURL: iconTarget.displayAvatarURL({ forceStatic: true })
			})
			.setDescription(`Message sent by ${author} ${actionPastTense} in ${channel}`)
			.setFooter({ text: `Author ID: ${author.valueOf()} | Message ID: ${id}` });

		const embeds = [embed];

		const collection =
			before?.attachments.subtract(message.attachments).concat(message.attachments) ?? message.attachments;

		const attachmentUrls = collection.map(({ url }) => url);

		const [first, ...rest] = attachmentUrls;

		if (first) {
			embed.setURL("https://discord.js.org/").setImage(first);

			const others = rest.map((url) => new EmbedBuilder().setURL("https://discord.js.org/").setImage(url));

			embeds.push(...others);
		}

		if (modifierType === Enums.ModifierType.Remove) {
			return { embeds };
		}

		const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View Message").setURL(url);

		return { embeds, button };
	}
}
