import { EntityType, Prisma } from "@prisma/client";
import { inject, singleton } from "tsyringe";

import { Beans } from "~/framework/DI/Beans.js";
import type { FetchExtendedClient } from "~/models/DB/prisma/extensions/types/index.js";

interface ConnectOrCreate {
	connectOrCreate: ConnectOrCreateOptions;
}

interface ConnectOrCreateOptions {
	create: CreateOptions;
	where: WhereOption;
}

interface CreateOptions extends Pick<Prisma.CaseCreateInput, "guild"> {
	id: string;
	type: EntityType;
}

interface WhereOption {
	id: string;
}

@singleton()
export class EntityInstanceMethods {
	private readonly client: FetchExtendedClient;

	constructor(
		@inject(Beans.IPrismaFetchClientToken)
		_client: FetchExtendedClient
	) {
		this.client = _client;
	}

	public connectOrCreateHelper<T>(
		this: T,
		id: string,
		connectGuild: Pick<Prisma.CaseCreateInput, "guild">,
		type: EntityType
	): ConnectOrCreate {
		return {
			connectOrCreate: {
				create: {
					id,
					...connectGuild,
					type
				},
				where: { id }
			}
		};
	}
}
