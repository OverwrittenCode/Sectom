import assert from "assert";

import { ValidationError } from "@helpers/errors/ValidationError.js";
import { COMMAND_SLASH_OPTION_TARGET_FLAGS } from "@ts/enums/COMMAND_SLASH_OPTION_TARGET_FLAGS.js";
import type { Typings } from "@ts/Typings.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { GuildMember, Role, User } from "discord.js";

type ParsedTargetEntityType = Typings.EntityObjectType | string;

export function TargetTransformer(flags: COMMAND_SLASH_OPTION_TARGET_FLAGS[] = []) {
	return function (
		target: ParsedTargetEntityType,
		interaction: ChatInputCommandInteraction
	): Typings.EntityObjectType {
		assert(interaction.inCachedGuild());

		const { guild, client, member } = interaction;

		if (typeof target === "string") {
			throw new ValidationError("invalid snowflake provided, please check your input");
		}

		if (flags.includes(COMMAND_SLASH_OPTION_TARGET_FLAGS.GUILD) && target instanceof User) {
			throw new ValidationError("given user does not exist in the server");
		}

		if (!flags.includes(COMMAND_SLASH_OPTION_TARGET_FLAGS.PASSIVE)) {
			let punishmentReflexivePronoun: string | null = null;

			switch (target.id) {
				case member.id:
					punishmentReflexivePronoun = "yourself";
					break;
				case guild.ownerId:
					punishmentReflexivePronoun = "the server owner";
					break;
				case client.user.id:
					punishmentReflexivePronoun = "me";
					break;
			}

			if (punishmentReflexivePronoun) {
				throw new ValidationError(`given user must not be ${punishmentReflexivePronoun}`);
			}

			const targetHighestRolePosition =
				target instanceof GuildMember
					? target.roles.highest.position
					: target instanceof Role
						? target.position
						: null;

			if (targetHighestRolePosition !== null) {
				const myHighestRolePosition = guild.members.me!.roles.highest.position;
				const usersHighestRolePosition = member.roles.highest.position;

				const disparityPossessivePronoun =
					targetHighestRolePosition >= myHighestRolePosition
						? "my"
						: targetHighestRolePosition >= usersHighestRolePosition
							? "your"
							: null;

				if (disparityPossessivePronoun) {
					throw new ValidationError(
						`target's highest role must be lower than ${disparityPossessivePronoun} highest role position`
					);
				}
			}
		}

		return target as Typings.EntityObjectType;
	};
}
