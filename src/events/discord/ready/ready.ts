import { Events } from "discord.js";
import { ArgsOf, Client, Discord, MetadataStorage, On } from "discordx";
import _ from "lodash";
import { container } from "tsyringe";

import { CommandUtils } from "~/helpers/utils/command.js";
import { ObjectUtils } from "~/helpers/utils/object.js";
import { Beans } from "~/models/framework/DI/Beans.js";
import { Enums } from "~/ts/Enums.js";
import { Typings } from "~/ts/Typings.js";

@Discord()
export abstract class Ready {
	@On({ event: Events.ClientReady })
	public async ready([client]: ArgsOf<Events.ClientReady>) {
		const bot = container.resolve<Client>(Beans.ISectomToken);

		await bot.initApplicationCommands();

		console.groupEnd();

		const commandSlashes = _.cloneDeep(
			MetadataStorage.instance.applicationCommandSlashes
		) as Array<Typings.DSlashCommand>;

		const flatCommandSlashes = MetadataStorage.instance
			.applicationCommandSlashesFlat as ReadonlyArray<Typings.DSlashCommand>;

		const categoryAppliedCommands = commandSlashes.map((cmd) => {
			cmd.category = flatCommandSlashes.find(({ name, group }) => [name, group].includes(cmd.name))!.category;

			return ObjectUtils.pickKeys(
				cmd as Required<Typings.DSlashCommand>,
				"name",
				"description",
				"options",
				"category"
			);
		});

		const categoryGroupedObj = Object.groupBy(categoryAppliedCommands, ({ category }) => category!) as Record<
			Enums.CommandCategory,
			typeof categoryAppliedCommands
		>;

		CommandUtils.categoryGroupedData = {
			keys: ObjectUtils.keys(categoryGroupedObj),
			values: Object.values(categoryGroupedObj),
			obj: categoryGroupedObj
		};

		console.log("Logged in as", client.user.tag);
	}
}
