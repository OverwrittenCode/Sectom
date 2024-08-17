import { ActionType } from "@prisma/client";
import { EmbedBuilder, Events, PermissionsBitField, PermissionsString, Role, bold } from "discord.js";
import { ArgsOf, Discord, On } from "discordx";

import { ObjectUtils } from "~/helpers/utils/object.js";
import { StringUtils } from "~/helpers/utils/string.js";
import {
	AbstractClazzFeatOptions,
	DiscordEventLogManager,
	MutualEventLogOptionOptions
} from "~/models/framework/managers/DiscordEventLogManager.js";

@Discord()
export abstract class RoleLog {
	private static readonly mutualBasedOptions: MutualEventLogOptionOptions<Role> = {
		name: true,
		hexColor: true,
		hoist: true,
		unicodeEmoji: true,
		position: true,
		mentionable: true,
		icon() {
			return {
				name: "Icon URL",
				transformer(_value, clazz) {
					return clazz.iconURL();
				}
			};
		}
	};

	@On({ event: Events.GuildRoleCreate })
	public roleCreate([role]: ArgsOf<Events.GuildRoleCreate>) {
		return this.roleFeat({
			clazz: role,
			actionType: ActionType.DISCORD_ROLE_CREATE
		});
	}

	@On({ event: Events.GuildRoleDelete })
	public roleDelete([role]: ArgsOf<Events.GuildRoleDelete>) {
		return this.roleFeat({
			clazz: role,
			actionType: ActionType.DISCORD_ROLE_DELETE
		});
	}

	@On({ event: Events.GuildRoleUpdate })
	public roleUpdate([oldRole, newRole]: ArgsOf<Events.GuildRoleUpdate>) {
		const embed = this.generateEmbed(newRole);

		return DiscordEventLogManager.updateHandler({
			embeds: [embed],
			old: oldRole,
			new: newRole,
			actionType: ActionType.DISCORD_ROLE_UPDATE,
			options: {
				...RoleLog.mutualBasedOptions,
				permissions: (before, after) => {
					const added = before.missing(after);
					const removed = after.missing(before);

					const fieldValue = this.permissionFieldValue({ added, removed });

					return { fieldValue };
				}
			}
		});
	}

	private roleFeat(options: AbstractClazzFeatOptions<Role>) {
		const { clazz, actionType } = options;

		const embed = this.generateEmbed(clazz);

		return DiscordEventLogManager.featHandler({
			embeds: [embed],
			clazz,
			actionType,
			options: {
				...RoleLog.mutualBasedOptions,
				permissions: (value) => {
					const allow = value.toArray();
					const deny = value.missing(PermissionsBitField.All);

					const fieldValue = this.permissionFieldValue({ allow, deny });

					return { fieldValue };
				}
			}
		});
	}

	private permissionFieldValue(obj: Record<string, PermissionsString[]>): string {
		return ObjectUtils.entries(obj)
			.reduce((acc, [key, arr]) => {
				if (arr.length) {
					const str = arr.map((str) => StringUtils.convertToTitleCase(str)).join(", ");

					const value = `${bold(StringUtils.capitaliseFirstLetter(key) + StringUtils.fieldNameSeparator)} ${str}`;

					acc.push(value);
				}

				return acc;
			}, [] as string[])
			.join(StringUtils.lineBreak);
	}

	private generateEmbed(role: Role): EmbedBuilder {
		const embed = new EmbedBuilder()
			.setAuthor({ name: role.name, iconURL: role.iconURL() ?? void 0 })
			.setThumbnail(role.iconURL())
			.setFooter({ text: `Role ID: ${role.id}` });

		return embed;
	}
}
