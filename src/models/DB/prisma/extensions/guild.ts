import { container, inject, singleton } from "tsyringe";

import { ValidationError } from "~/helpers/errors/ValidationError.js";
import type { FetchExtendedClient } from "~/models/DB/prisma/extensions/types/index.js";
import { Beans } from "~/models/framework/DI/Beans.js";

interface FetchValidConfigurationOptions {
	check?: keyof PrismaJson.Configuration;
	guildId: string;
}

@singleton()
export class GuildInstanceMethods {
	private static readonly defaultContentClusterManagerComponents = {
		panels: [],
		subjects: []
	};

	private readonly client: FetchExtendedClient;

	public static readonly defaultConfiguration: PrismaJson.Configuration = {
		warning: {
			durationMultiplier: 1,
			thresholds: []
		},
		suggestion: GuildInstanceMethods.defaultContentClusterManagerComponents,
		ticket: {
			...GuildInstanceMethods.defaultContentClusterManagerComponents,
			prompt: true
		},

		leveling: {
			stackXPMultipliers: true,
			cooldown: 3000,
			multiplier: 1,
			roles: [],
			overrides: []
		}
	};

	constructor(
		@inject(Beans.IPrismaFetchClientToken)
		_client: FetchExtendedClient
	) {
		this.client = _client;
	}

	public async fetchValidConfiguration<T, const Options extends FetchValidConfigurationOptions>(
		this: T,
		options: Options
	) {
		const clazz = container.resolve(GuildInstanceMethods);

		const { guildId } = options;

		const {
			doc: { configuration },
			save
		} = await clazz.client.guild.fetchById({
			id: guildId,
			select: {
				configuration: true
			},
			createData: {
				id: guildId,
				configuration: GuildInstanceMethods.defaultConfiguration
			}
		});

		if (options.check && configuration[options.check].disabled) {
			throw new ValidationError(ValidationError.messageTemplates.SystemIsDisabled(options.check));
		}

		return { configuration, save };
	}
}
