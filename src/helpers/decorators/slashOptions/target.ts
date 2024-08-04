import assert from "assert";

import { ApplicationCommandOptionType, ChannelType, GuildMember, Role, User } from "discord.js";
import { SlashOption } from "discordx";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { CommandUtils } from "~/helpers/utils/command.js";
import { StringUtils } from "~/helpers/utils/string.js";
import { Enums } from "~/ts/Enums.js";
import type { Typings } from "~/ts/Typings.js";

import type { ChatInputCommandInteraction } from "discord.js";
import type { ParameterDecoratorEx, SlashOptionOptions } from "discordx";

interface TargetSlashOptionArguments {
	channelTypes?: ChannelType[];
	descriptionNote?: string;
	entityType: keyof typeof CommandUtils.entityType;
	flags?: Enums.CommandSlashOptionTargetFlags[];
	name?: Lowercase<string>;
	required?: boolean;
}

export function GivenChannelSlashOption(
	options: Omit<TargetSlashOptionArguments, "entityType" | "flags" | "name"> = {}
): ParameterDecoratorEx {
	const { channelTypes, descriptionNote, required = false } = options;

	return (target: Record<string, any>, propertyKey: string, parameterIndex: number) =>
		TargetSlashOption({
			entityType: CommandUtils.entityType.CHANNEL,
			name: CommandUtils.slashOptions.ChannelPermissionName,
			descriptionNote,
			required,
			channelTypes
		})(target, propertyKey, parameterIndex);
}

export function TargetSlashOption(args: TargetSlashOptionArguments): ParameterDecoratorEx {
	const { entityType, flags = [], required = true, name } = args;

	let { descriptionNote = "", channelTypes } = args;

	if (descriptionNote) {
		descriptionNote += ". ";
	}

	descriptionNote += "Ex: 1090725120628111864";

	const entityTypeLowercase = entityType.toLowerCase() as Lowercase<typeof entityType>;
	const entityTypeSentenceCase = StringUtils.capitaliseFirstLetter(entityTypeLowercase);

	if (entityTypeSentenceCase === "Channel") {
		channelTypes ??= [ChannelType.GuildText];
	}

	const slashOptionObj = {
		description: `The ${entityTypeLowercase} mention or ${entityTypeLowercase}Id. ${descriptionNote}`,
		name: name ?? entityTypeLowercase,
		type:
			entityTypeSentenceCase === "Snowflake"
				? ApplicationCommandOptionType.Mentionable
				: ApplicationCommandOptionType[entityTypeSentenceCase],
		required,
		channelTypes
	} as SlashOptionOptions<Lowercase<string>, string>;

	const transformer = (
		target: Typings.EntityObjectType | string | undefined,
		interaction: ChatInputCommandInteraction
	): Typings.EntityObjectType<true> | undefined => {
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

		if (
			flags.includes(Enums.CommandSlashOptionTargetFlags.NoBot) &&
			(target instanceof GuildMember ? target.user : target instanceof User ? target : null)?.bot
		) {
			throw new ValidationError("bots are not allowed to be used here");
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

		return target;
	};

	return (target: Record<string, any>, propertyKey: string, parameterIndex: number) =>
		SlashOption(slashOptionObj, transformer)(target, propertyKey, parameterIndex);
}
