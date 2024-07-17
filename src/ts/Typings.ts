import { type Prisma as _Prisma } from "@prisma/client";

import type { Enums } from "~/ts/Enums.js";

import type { ICategory } from "@discordx/utilities";
import type { Index, Query } from "@upstash/query";
import type { ImageSource } from "canvacord";
import type {
	AutocompleteInteraction,
	ButtonInteraction,
	CacheType,
	ChannelSelectMenuInteraction,
	CommandInteraction,
	ContextMenuCommandInteraction,
	GuildBasedChannel,
	GuildMember,
	MentionableSelectMenuInteraction,
	MessageComponentInteraction,
	ModalSubmitInteraction,
	Role,
	RoleSelectMenuInteraction,
	StringSelectMenuInteraction,
	TextChannel,
	User,
	UserSelectMenuInteraction
} from "discord.js";
import type { DApplicationCommand } from "discordx";
import type { Join } from "type-fest";

export namespace Typings {
	export namespace Database {
		export namespace Prisma {
			export type RetrieveModelDocument<M extends _Prisma.ModelName = _Prisma.ModelName> = M extends M
				? _Prisma.TypeMap["model"][M]["payload"]["scalars"]
				: never;
		}

		export namespace Redis {
			export type RetrieveModelDocument<M extends _Prisma.ModelName> = M extends M
				? Prettify<
						{
							[K in keyof Prisma.RetrieveModelDocument<M>]: Prisma.RetrieveModelDocument<M>[K] extends
								| AllowedStringify
								| Record<string, string | number>
								? Prisma.RetrieveModelDocument<M>[K]
								: null extends Prisma.RetrieveModelDocument<M>
									? string | null
									: string;
						} & { id: string }
					>
				: never;

			export type ModelCollection<M extends _Prisma.ModelName> = ReturnType<
				typeof Query.prototype.createCollection<Prisma.RetrieveModelDocument<M>>
			>;

			export type RetrieveRecord<M extends _Prisma.ModelName> = {
				id: string;
				ts: number;
				data: Prisma.RetrieveModelDocument<M>;
			};

			export type TTerms<M extends _Prisma.ModelName> = Parameters<
				ModelCollection<M>["createIndex"]
			>["0"]["terms"] &
				Array<keyof Prisma.RetrieveModelDocument<M>>;

			export type IndexNames<T extends string[]> = `by${Join<
				{
					[K in keyof T]: T[K] extends string ? Capitalize<T[K]> : T[K];
				},
				"And"
			>}`;

			export type Indexes<M extends _Prisma.ModelName, T extends TTerms<M>[]> = MergeUnionTransformedTuples<M, T>;

			export type IndexObject<M extends _Prisma.ModelName, T extends TTerms<M>> = Prettify<
				UnionToIntersection<
					T extends T
						? {
								[K in IndexNames<T>]: IndexNames<T> extends infer U
									? U extends K
										? Index<Prisma.RetrieveModelDocument<M>, T>
										: never
									: never;
							}
						: never
				>
			>;

			type Contra<T> = T extends any ? (arg: T) => void : never;

			type InferContra<T> = [T] extends [(arg: infer I) => void] ? I : never;

			type PickOne<T> = InferContra<InferContra<Contra<Contra<T>>>>;

			type UnionToTuple<T> =
				PickOne<T> extends infer U
					? Exclude<T, U> extends never
						? [T]
						: [...UnionToTuple<Exclude<T, U>>, U]
					: never;

			type TransformTuple<T extends string[]> = T extends T
				? {
						name: IndexNames<T>;
						terms: T;
					}
				: never;

			type MergeUnionTransformedTuples<
				M extends _Prisma.ModelName,
				T extends Database.Redis.TTerms<M>[]
			> = T["length"] extends 0 ? {} : UnionToTuple<TransformTuple<T[number]>>;
		}

		export type DocumentInput<M extends _Prisma.ModelName = _Prisma.ModelName> =
			| Redis.RetrieveModelDocument<M>
			| Prisma.RetrieveModelDocument<M>;

		export type OnlyFilterableTypes<T> = T extends T
			? {
					[K in keyof T as NonNullable<T[K]> extends Record<string, any> | any[] ? never : K]: T[K];
				}
			: never;

		export type SimpleFilter<M extends _Prisma.ModelName = _Prisma.ModelName> = M extends M
			? Prettify<
					OnlyFilterableTypes<
						Partial<
							Intersection<
								Required<_Prisma.TypeMap["model"][M]["operations"]["findFirst"]["args"]>["where"],
								Prisma.RetrieveModelDocument<M>
							>
						>
					>
				>
			: never;

		export type SimpleWhere<
			M extends _Prisma.ModelName = _Prisma.ModelName,
			State extends "retrievable" | "wildcard" | "union" = "union"
		> = M extends M
			? OnlyFilterableTypes<Prisma.RetrieveModelDocument<M>> extends infer T
				? {
						[K in keyof T]?: State extends "retrievable"
							? T[K]
							: NonNullable<T[K]> extends boolean
								? T[K]
								: ExactlyOneOf<
											Record<
												"in" | "notIn",
												Array<T[K] extends NonNullable<T[K]> ? T[K] : NonNullable<T[K]>>
											>
									  > extends infer U
									? State extends "wildcard"
										? U
										: T[K] | U
									: never;
					} extends infer U
					? State extends "retrievable"
						? U
						: U & { OR?: U[] }
					: never
				: never
			: never;

		export type SimpleUniqueWhereId<M extends _Prisma.ModelName = _Prisma.ModelName> = M extends M
			? Exclude<
					_Prisma.TypeMap["model"][M]["operations"]["findUnique"]["args"]["where"]["id"],
					undefined | (string & Record<any, any>)
				>
			: never;

		export type SimpleSelect<M extends _Prisma.ModelName = _Prisma.ModelName> = M extends M
			? Partial<Record<keyof Prisma.RetrieveModelDocument<M>, true>>
			: never;

		export type SimpleSelectOutput<
			M extends _Prisma.ModelName,
			T extends SimpleSelect<M> | undefined = undefined
		> = M extends M
			? T extends T
				? undefined extends T
					? Prisma.RetrieveModelDocument<M>
					: keyof T extends keyof Prisma.RetrieveModelDocument<M>
						? Pick<Prisma.RetrieveModelDocument<M>, keyof T>
						: never
				: never
			: never;
	}

	export type AllowedStringify = string | number | bigint | boolean | null | undefined;
	export type DisplaceObjects<T1, T2> = Omit<T1, keyof T2> & T2;
	export type Listable<T> = T | T[];
	export type ObjectValues<T> = T[keyof T];
	export type SetNullableCase<T, WithoutFalsyCase extends boolean = true> = WithoutFalsyCase extends true
		? T
		: T | null | undefined;
	export type Prettify<T> = {
		[K in keyof T]: T[K];
	} & {};
	export type PickMatching<T, V> = { [K in keyof T as T[K] extends V | (() => V) ? K : never]: T[K] };
	export type ExactlyOneOf<T> = {
		[K in keyof T]: Prettify<Pick<T, K> & Partial<Record<Exclude<keyof T, K>, never>>>;
	}[keyof T];
	export type Intersection<T, U> = {
		[K in keyof T & keyof U]: U[K];
	};
	export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void
		? I
		: never;

	export type Concatenate<T extends any[], Seperator extends string = ""> = T extends []
		? ""
		: T extends [infer F, ...infer R]
			? F extends string
				? F extends ""
					? Concatenate<R, Seperator>
					: `${F}${R extends [] | [""] ? "" : Seperator}${Concatenate<R, Seperator>}`
				: Concatenate<R, Seperator>
			: string;

	export type GuildInteraction<Cache extends CacheType | undefined = CacheType> =
		| ButtonInteraction<Cache>
		| ChannelSelectMenuInteraction<Cache>
		| CommandInteraction<Cache>
		| ContextMenuCommandInteraction<Cache>
		| MessageComponentInteraction<Cache>
		| MentionableSelectMenuInteraction<Cache>
		| ModalSubmitInteraction<Cache>
		| RoleSelectMenuInteraction<Cache>
		| StringSelectMenuInteraction<Cache>
		| UserSelectMenuInteraction<Cache>
		| AutocompleteInteraction<Cache>;

	export type DeferrableGuildInteraction<Cache extends CacheType | undefined = CacheType> = Extract<
		GuildInteraction<Cache>,
		{ deferred: boolean }
	>;

	export type CachedGuildInteraction = GuildInteraction<"cached">;
	export type CachedDeferrableGuildInteraction = DeferrableGuildInteraction<"cached">;

	type TargetType<TextBased extends boolean = true> = TextBased extends true
		? User | Role | TextChannel
		: User | Role | GuildBasedChannel;

	export type EntityObjectType<TextBased extends boolean = true> = TargetType<TextBased> | GuildMember;

	export type CanvacordImage = Extract<ImageSource, { mime: string }>;

	export type DSlashCommand = DApplicationCommand & ICategory<Enums.CommandCategory>;
}
