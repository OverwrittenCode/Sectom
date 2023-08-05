import type { DocumentType, SubDocumentType } from "@typegoose/typegoose";
import {
	getModelForClass,
	modelOptions,
	post,
	pre,
	prop
} from "@typegoose/typegoose";
import { TimeStamps } from "@typegoose/typegoose/lib/defaultClasses.js";

import { UNEXPECTED_FALSY_VALUE__MESSAGE } from "../utils/config.js";
import { ValidationError } from "../utils/errors/ValidationError.js";
import { getEntityFromGuild } from "../utils/interaction.js";
import type { GuildInteraction } from "../utils/ts/Action.js";
import type { MongooseDocumentType } from "../utils/ts/General.js";

import { CasesModel } from "./Moderation/Cases.js";
import { Blacklist, Whitelist } from "./Moderation/List.js";

@modelOptions({
	schemaOptions: {
		timestamps: true
	}
})
export class SnowflakeLog {
	@prop({ required: true })
	/**
	 * The snowflake id
	 */
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
	console.log("A server document is going to be saved.");
	next();
})
@post<Server>("save", function (doc: DocumentType<Server>) {
	// This post-save hook will run after a document is saved
	console.log("A server document has been saved.", doc.toJSON());
})
export class Server extends TimeStamps {
	@prop({ required: true })
	public readonly serverId!: string;

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
	if (!interaction.guild || !interaction.guildId)
		throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);
	let status = 201;
	let server = await ServerModel.findOne({
		serverId: interaction.guildId!
	});

	const guildOwner = await getEntityFromGuild(
		interaction,
		["members"],
		interaction.guild.ownerId
	);

	if (!guildOwner) throw new ValidationError(UNEXPECTED_FALSY_VALUE__MESSAGE);

	if (!server) {
		await interaction.editReply({
			content: "Server configuration not found, setting up database..."
		});

		status = 404;
		server = await new ServerModel({
			createdBy: {
				id: interaction.guild.ownerId,
				name: guildOwner.user.tag
			},
			serverId: interaction.guildId,
			serverName: interaction.guild?.name
		}).save();

		await interaction.editReply({
			content: "Setting up other models..."
		});

		await new CasesModel({
			server: server._id
		}).save();

		if (interaction.isCommand())
			await interaction.editReply({
				content:
					"Database queries have already been sent, and caching has not been setup, so this command may take longer than usual due to prior database calls."
			});
	}

	if (getStatus) {
		return {
			status,
			object: server as MongooseDocumentType<Server>
		};
	}

	return server as MongooseDocumentType<Server>;
}
// const ServerModelChangeStream =
// 	ServerModel.watch<Document<unknown, BeAnObject, Server>>();

// ServerModelChangeStream.on(
// 	"change",
// 	async (change: ChangeStreamDocument<Server>) => {
// 		if (change.operationType === "insert") {  }
// 	}
// );
