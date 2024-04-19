import { singleton } from "tsyringe";

import { RedisCacheManager } from "~/managers/RedisCacheManager.js";
import type { Typings } from "~/ts/Typings.js";

import type { ChatInputCommandInteraction } from "discord.js";

interface PermissionResponse {
	cacheHit: boolean;
	isPermitted: boolean;
}

const indexList = [["guildId"], ["guildId", "id"]] as const satisfies Typings.Database.Redis.TTerms<"Case">[];

@singleton()
export class CaseRedisCache extends RedisCacheManager<"Case", typeof indexList> {
	constructor() {
		super("Case", indexList);
	}

	public async retrievePermissionStatus(
		interaction: ChatInputCommandInteraction<"cached">
	): Promise<PermissionResponse> {
		const { guildId } = interaction;

		const matchedResults = await this.indexes.byGuildId.match({ guildId });
		const guildCases = matchedResults.map((v) => v.data);

		const cacheHit = true;

		if (!guildCases.length) {
			return {
				cacheHit: false,
				isPermitted: false
			};
		}

		const roleIDArray = [...interaction.member.roles.valueOf().values()].map((role) => role.id);

		const entityTypeIDList = [interaction.user.id, interaction.channelId, ...roleIDArray];

		const accessTypes = ["BLACKLIST", "WHITELIST"] as const;
		const { WHITELIST, BLACKLIST } = Object.groupBy(
			guildCases.filter(({ action }) => !!action && accessTypes.some((str) => str === action.split("_")[0])),
			({ action }) => action!.split("_")[0] as (typeof accessTypes)[number]
		);

		const notInBlacklist = !BLACKLIST?.some(({ targetId }) => entityTypeIDList.includes(targetId));

		let isPermitted = notInBlacklist;

		const isWhitelistStateActive = !!WHITELIST?.length;

		if (isWhitelistStateActive && isPermitted) {
			const inWhitelist = WHITELIST?.some(({ targetId }) => entityTypeIDList.includes(targetId));
			isPermitted &&= inWhitelist;
		}

		return {
			cacheHit,
			isPermitted
		};
	}
}
