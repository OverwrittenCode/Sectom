import type { DocumentType, SubDocumentType } from "@typegoose/typegoose";
import { post, pre, prop } from "@typegoose/typegoose";
import type { ButtonInteraction, CommandInteraction } from "discord.js";

import { logger } from "../../utils/logger.js";
import type { ServerModelSelectionSnowflakeType } from "../../utils/type.js";

import { AccessSelection } from "./AccessGate.js";

/**
 * Command class
 * Represents a command in the system
 */

@pre<Command>("save", function (next) {
	logger.http("A command document is going to be saved.");
	next();
})
@post<Command>("save", function (doc: DocumentType<Command>) {
	logger.http("A command document has been saved.", doc.toJSON());
})
export class Command extends AccessSelection {
	@prop({ required: true })
	public commandName!: string;

	public async addToList(
		this: SubDocumentType<Command>,
		element: ServerModelSelectionSnowflakeType,
		interaction: CommandInteraction | ButtonInteraction
	) {
		const strProp = interaction.guild!.members.cache.has(element.id)
			? "users"
			: interaction.guild!.roles.cache.has(element.id)
			? "roles"
			: "channels";

		(this[strProp] as ServerModelSelectionSnowflakeType[]).push(element);
		return await this.ownerDocument().save();
	}

	public async removeFromList(
		this: SubDocumentType<Command>,
		element: ServerModelSelectionSnowflakeType,
		interaction: CommandInteraction | ButtonInteraction
	) {
		const strProp = interaction.guild!.members.cache.has(element.id)
			? "users"
			: interaction.guild!.roles.cache.has(element.id)
			? "roles"
			: "channels";
		const selection = this[strProp] as ServerModelSelectionSnowflakeType[];

		(this[strProp] as ServerModelSelectionSnowflakeType[]) = selection.filter(
			(e) => e.id != element.id
		);

		return await this.ownerDocument().save();
	}
}
