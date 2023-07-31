import type { DocumentType, SubDocumentType } from "@typegoose/typegoose";
import {
	getModelForClass,
	modelOptions,
	post,
	pre,
	prop
} from "@typegoose/typegoose";
import { TimeStamps } from "@typegoose/typegoose/lib/defaultClasses.js";
import type { BeAnObject } from "@typegoose/typegoose/lib/types.js";
import type { ChangeStreamDocument } from "mongodb";
import type { Document } from "mongoose";

import { getEntityFromGuild } from "../utils/interaction.js";
import { logger } from "../utils/logger.js";
import type { GuildInteraction } from "../utils/ts/Action.js";
import type { MongooseDocumentType } from "../utils/ts/General.js";

import { Blacklist } from "./Moderation/Blacklist.js";
import { ModerationCases } from "./Moderation/ModerationCases.js";
import { Whitelist } from "./Moderation/Whitelist.js";

@modelOptions({
	schemaOptions: {
		timestamps: true
	}
})
export class SnowflakeLog {
	@prop({ required: true })
	public readonly id!: string;

	@prop()
	public expired?: boolean;
}

/**
 * User class
 * Represents a user in the system
 */
@pre<User>("save", function () {
	// This pre-save hook will run before a document is saved
	if (this.name.endsWith("#0")) this.name = this.name.slice(0, -2);
})
export class User extends SnowflakeLog {
	@prop({ required: true })
	public name!: string;
}

export class Role extends User {}

export class Channel extends User {}

@pre<Server>("save", function (next) {
	// This pre-save hook will run before a document is saved
	logger.http("A server document is going to be saved.");
	next();
})
@post<Server>("save", function (doc: DocumentType<Server>) {
	// This post-save hook will run after a document is saved
	logger.http("A server document has been saved.", doc.toJSON());
})
export class Server extends TimeStamps {
	@prop({ required: true })
	public readonly serverId!: string;

	@prop({ type: () => ModerationCases, default: {} })
	public cases!: SubDocumentType<ModerationCases>;

	@prop({ required: true })
	public serverName!: string;

	@prop({ type: () => User, required: true })
	public createdBy!: SubDocumentType<User>;
}

export const ServerModel = getModelForClass(Server);
export const UserModel = getModelForClass(User);
export const BlacklistModel = getModelForClass(Blacklist);
export const WhitelistModel = getModelForClass(Whitelist);

export async function findOrCreateServer(
	interaction: GuildInteraction
): Promise<MongooseDocumentType<Server>>;

export async function findOrCreateServer(
	interaction: GuildInteraction,
	getStatus: true
): Promise<{ status: 201 | 404; object: MongooseDocumentType<Server> }>;

export async function findOrCreateServer<T extends boolean>(
	interaction: GuildInteraction,
	getStatus?: T
) {
	let status = 201;
	let server = await ServerModel.findOne({
		serverId: interaction.guildId!
	});

	if (!server) {
		status = 404;
		server = await new ServerModel({
			createdBy: {
				id: interaction.guild?.ownerId,
				name: (
					await getEntityFromGuild(
						interaction,
						["members"],
						interaction.guild?.ownerId
					)
				)?.user.tag
			},
			serverId: interaction.guildId,
			serverName: interaction.guild?.name
		}).save();
	}

	if (getStatus) {
		return {
			status,
			object: server as MongooseDocumentType<Server>
		};
	}

	return server as MongooseDocumentType<Server>;
}
const ServerModelChangeStream =
	ServerModel.watch<Document<unknown, BeAnObject, Server>>();

ServerModelChangeStream.on("change", (change: ChangeStreamDocument<Server>) => {
	if (change.operationType === "insert" && change.fullDocument.cases.actions) {
		const { actions } = change.fullDocument.cases;
		const action = actions[actions.length - 1];
		logger.http(`A new Action was added: ${action}`);

		// TODO: Log the action to the Discord server using the 'serverID' property
	}
});
