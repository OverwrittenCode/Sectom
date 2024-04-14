import { type Prisma as _Prisma } from "@prisma/client";
import type { Index, Query } from "@upstash/query";
import type {
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
	User,
	UserSelectMenuInteraction
} from "discord.js";
import type { Join, UnionToIntersection } from "type-fest";

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

			export type TTerms<M extends _Prisma.ModelName> = Parameters<
				ModelCollection<M>["createIndex"]
			>["0"]["terms"];

			export type IndexNames<T extends string[]> = `by${Join<T, "And", true>}`;

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
	}

	export type AllowedStringify = string | number | bigint | boolean | null | undefined;
	export type DisplaceObjects<T1, T2> = Omit<T1, keyof T2> & T2;
	export type SetNullableCase<T, WithoutFalsyCase extends boolean = true> = WithoutFalsyCase extends true
		? T
		: T | null | undefined;
	export type Prettify<T> = {
		[K in keyof T]: T[K];
	} & {};
	export type PickMatching<T, V> = { [K in keyof T as T[K] extends V | (() => V) ? K : never]: T[K] };

	export type TitleCase<T extends string> = T extends `${infer First}${infer Rest}`
		? `${Uppercase<First>}${Rest}`
		: T;
	export type Concatenate<T extends any[]> = T extends []
		? ""
		: T extends [infer F, ...infer R]
			? F extends string
				? F extends ""
					? `${F}${Concatenate<R>}`
					: `${F}${R extends [] ? "" : " "}${Concatenate<R>}`
				: never
			: never;
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
		| UserSelectMenuInteraction<Cache>;

	export type CachedGuildInteraction = GuildInteraction<"cached">;

	export type TargetType = User | Role | GuildBasedChannel;
	export type EntityObjectType = TargetType | GuildMember;
}
