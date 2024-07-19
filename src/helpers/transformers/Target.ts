import assert from "assert";

import { GuildMember, Role, User } from "discord.js";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";

import type { ChatInputCommandInteraction } from "discord.js";

type ParsedTargetEntityType = Typings.EntityObjectType | string;

export function TargetTransformer(flags: Enums.CommandSlashOptionTargetFlags[] = []) {
	return function (
		target: ParsedTargetEntityType | undefined,
		interaction: ChatInputCommandInteraction
	): Typings.EntityObjectType | undefined {
		assert(interaction.inCachedGuild());

		const { guild, client, member } = interaction;

		if (typeof target === "undefined") {
			return target;
		}

		if (typeof target === "string") {
			throw new ValidationError("invalid snowflake provided, please check your input");
		}

		if (flags.includes(Enums.CommandSlashOptionTargetFlags.Guild) && target instanceof User) {
			throw new ValidationError("given user does not exist in the server");
		}

		if (!flags.includes(Enums.CommandSlashOptionTargetFlags.Passive)) {
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

			if (targetHighestRolePosition) {
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
