import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "../../utils/config.js";
import { ValidationError } from "../../utils/errors/ValidationError.js";
import { replyOrFollowUp } from "../../utils/interaction.js";
import { GuildInteraction } from "../../utils/ts/Action.js";
import { TypegooseDocumentType } from "../../utils/ts/General.js";
import { Cases, CasesModel } from "../models/Moderation/Cases.js";
import { Server, ServerModel } from "../models/Server.js";
import { RedisCache } from "./index.js";

import { CacheDocument, CacheManager } from "./manager.js";

type CachedServerDocument = CacheDocument<Server>;
type DatabseServerDocument = TypegooseDocumentType<Server>;

type Status = "cache" | "fetched" | "created";

type CachedServerObject = {
	status: "cache";
	document: CachedServerDocument;
};

type DatabaseServerObject = {
	status: "fetched" | "created";
	document: DatabseServerDocument;
	cache: CachedServerDocument;
};

export class ServerCacheManager extends CacheManager<Server> {
	constructor() {
		super("server:", "serverId");
	}

	public async findOrCreate(
		interaction: GuildInteraction
	): Promise<CachedServerObject | DatabaseServerObject> {
		if (!interaction.guild || !interaction.guildId) {
			throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
		}

		const serverId = interaction.guildId;

		let status: Status = "cache";
		let document: CachedServerDocument | DatabseServerDocument;

		const cachedServerDocument = await this.get(serverId);

		if (cachedServerDocument) {
			document = cachedServerDocument;
		} else {
			status = "fetched";
			let databaseServerDocument = await ServerModel.findOne({
				serverId
			});

			if (!databaseServerDocument) {
				await replyOrFollowUp(interaction, {
					content: "Server configuration not found, please wait...",
					ephemeral: true
				});
				const guildOwner = await interaction.guild.fetchOwner({
					force: true
				});
				const { id } = guildOwner;

				databaseServerDocument = await new ServerModel({
					serverId,
					serverName: interaction.guild.name,
					createdBy: {
						id,
						name: guildOwner.user.tag
					}
				}).save();

				status = "created";

				const databaseCasesDocument = await new CasesModel({
					server: databaseServerDocument._id
				}).save();

				await RedisCache.cases.set(databaseCasesDocument);
			}

			await RedisCache.server.set(databaseServerDocument);

			document = databaseServerDocument;
		}

		const serverObject = {
			status,
			document
		};

		if (status === "cache") {
			return serverObject as CachedServerObject;
		} else {
			return serverObject as DatabaseServerObject;
		}
	}
}
