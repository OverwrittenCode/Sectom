import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "../../../utils/config.js";
import { ValidationError } from "../../../utils/errors/ValidationError.js";
import {
	AccessGateSubGroupApplicationCommandOptionType,
	TargetClass
} from "../../../utils/ts/Access.js";
import { GuildInteraction } from "../../../utils/ts/Action.js";
import { ListType } from "../../../utils/ts/Enums.js";
import { ListInstanceUnion } from "../../models/Moderation/List.js";
import { CacheDocument } from "../manager.js";

import { SnowflakeType } from "./index.js";

type CachedListDocument = CacheDocument<ListInstanceUnion>;
type UserInputFilters = SnowflakeType[];
type Entity = {
	[K in SnowflakeType]?: boolean;
};

export class CasesCacheSubListManager {
	private readonly type: `${ListType}`;
	constructor(type: `${ListType}`) {
		this.type = type;
	}

	public isSnowflakeInList(
		cachedListDocument: CachedListDocument,
		interaction: GuildInteraction,
		snowflakeId: string
	) {
		if (!interaction.guild || !interaction.guildId) {
			throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
		}

		const accessBarrierBoolean = this.type == "blacklist" ? false : true;
		if (interaction.guild.ownerId == snowflakeId) {
			return accessBarrierBoolean;
		}

		const entityMap: Entity = {
			users: false,
			roles: false,
			channels: false
		};

		const selection: UserInputFilters = ["users", "roles", "channels"];

		const hasData = (str: SnowflakeType) =>
			cachedListDocument[str].length >= 1 ||
			cachedListDocument.commands.some((cmd: any) => cmd[str].length >= 1);

		const keys = selection.filter(hasData);

		if (keys.length == 0) {
			return accessBarrierBoolean;
		}

		const containsTarget = (entityType: CachedListDocument["users"][0]) =>
			entityType.id == snowflakeId;

		for (const key of keys) {
			const isPresent = (entityMap[key] =
				cachedListDocument[key].some(containsTarget) ||
				cachedListDocument.commands.some((cmd: any) =>
					cmd[key].some(containsTarget)
				));

			entityMap[key] = isPresent;
		}

		return Object.values(entityMap).some((v) => v);
	}

	public checkIfExists(
		cachedListDocument: CachedListDocument,
		target: AccessGateSubGroupApplicationCommandOptionType,
		targetClassStr: `${TargetClass}`,
		commandName?: string
	) {
		return commandName
			? cachedListDocument.commands!.findIndex(
					(cmd: any) =>
						cmd.commandName === commandName &&
						cmd[targetClassStr]!.find((v: any) => v.id == target.id)
			  ) != -1
			: typeof cachedListDocument[targetClassStr]!.find(
					(v: any) => v.id == target.id
			  ) != "undefined";
	}
}
