import type { Typings } from "~/ts/Typings.js";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { DynamicClientExtensionThis, InternalArgs, Operation } from "@prisma/client/runtime/library.js";

export type BaseFetchOptionsUnion<TModel> =
	| BaseFetchByIdOptions<TModel>
	| BaseFetchFirstOptions<TModel>
	| BaseFetchManyOptions<TModel>;
export type ClientCTX<M extends Prisma.ModelName = Prisma.ModelName, Inner extends boolean = false> = {
	[K in Lowercase<M>]: Typings.DisplaceObjects<
		PrismaClient[K] & $NameCTX<Capitalize<K>>,
		{
			/**
			 * for some reason Prisma converts fields to an empty object for extension context
			 */
			fields: {};
			$parent: ClientCTX<Capitalize<K>, true>;
		}
	>;
} extends infer R
	? Inner extends false
		? R
		: R & $NameCTX<M>
	: never;
export type FetchExtendedClient = DynamicClientExtensionThis<
	Prisma.TypeMap<InternalArgs & FetchExtensionArg>,
	Prisma.TypeMapCb,
	FetchExtensionArg
>;

type FetchExtensionArg = Record<"result" | "query" | "client", {}> & {
	model: Record<
		"$allModels" | Lowercase<Prisma.ModelName>,
		{
			[K in keyof FetchFunctions]: () => FetchFunctions[K];
		}
	>;
};

type FetchFunction<F extends FetchableOperations> = <TModel, _TArgs, O extends FetchOptions<TModel, F>>(
	this: TModel,
	options: O
) => Promise<FetchOutput<TModel, F, O>>;

export type FetchFunctions = {
	[F in FetchableOperations as FetchOperationUnion<F>]: FetchFunction<F>;
};
export type FetchOperationUnion<F extends FetchableOperations = FetchableOperations> =
	F extends `find${infer V extends string}`
		? `fetch${V extends "Unique" ? "ById" : V extends "UniqueOrThrow" ? "ByIdOrThrow" : V}`
		: never;
export type FetchOptions<TModel, F extends FetchableOperations = FetchableOperations> = BaseFetchOptionsUnion<TModel> &
	(F extends `${string}OrThrow` ? {} : FetchValidationOptions | FetchCreateDataOptions<TModel, F>);
export type FetchOutput<
	TModel,
	F extends FetchableOperations = FetchableOperations,
	O extends FetchOptions<TModel, F> = FetchOptions<TModel, F>
> = Exclude<
	Typings.SetNullableCase<
		Typings.Prettify<
			Typings.Database.SimpleSelectOutput<
				RetrieveModelName<TModel>,
				O["select"] extends infer T extends Typings.Database.SimpleSelect<RetrieveModelName<TModel>>
					? T &
							(Typings.Database.SimpleUniqueWhereId<RetrieveModelName<TModel>> extends infer U extends
								| Record<string, string>
								| string
								? U extends Record<string, string>
									? Record<keyof U, true>
									: { id: true }
								: never) // make sure typings reflect enforcing id fields to be in the selection
					: undefined
			>
		> extends infer X
			? F extends `${string}Many`
				? X[]
				: IWithSave<TModel, X>
			: never,
		F extends `${string}${"OrThrow" | "Many"}`
			? true
			: O extends Required<FetchCreateDataOptions<TModel, F>>
				? true
				: false
	>,
	undefined
>;
export type FetchShadowDoc = Typings.Listable<Typings.Database.Prisma.RetrieveModelDocument<"Case">> | null | undefined;
export type FetchSimpleSelect<TModel> = Typings.Database.SimpleSelect<RetrieveModelName<TModel>>;
export type FetchableOperations = Extract<Operation, `find${"F" | "U" | "M"}${string}`>;
export type FlushDBResult = {
	_totalCount: number;
} & {
	[K in Lowercase<Prisma.ModelName>]: number;
};
export type ModelCTX<TModel, Shadow extends boolean = false> = Shadow extends true
	? ClientCTX["case"]
	: TModel[keyof TModel] extends infer U
		? Prisma.ModelName extends infer M extends keyof Prisma.TypeMap["model"]
			? M extends M
				? U extends Prisma.TypeMap["model"][M]["fields"]
					? Omit<ClientCTX<M, true>, keyof $NameCTX> extends infer V
						? V[keyof V]
						: never
					: never
				: never
			: never
		: never;
export type RetrieveModelName<TModel> = ModelCTX<TModel>["$name"];
export type ShadowCTXName = ModelCTX<any, true>["$name"];

export interface $NameCTX<M extends Prisma.ModelName = Prisma.ModelName> {
	$name: M;
}

export interface BaseFetchByIdOptions<TModel> extends BaseFetchOptions<TModel> {
	id: Typings.Database.SimpleUniqueWhereId<RetrieveModelName<TModel>>;
}

export interface BaseFetchFirstOptions<TModel> extends BaseFetchOptions<TModel> {
	where?: Typings.Database.SimpleWhere<RetrieveModelName<TModel>>;
}

export interface BaseFetchManyOptions<TModel> extends BaseFetchFirstOptions<TModel> {
	orderBy?: Partial<Record<keyof Typings.Database.OnlyFilterableTypes<FetchSimpleSelect<TModel>>, Prisma.SortOrder>>;
	take?: number;
}

export interface BaseFetchOptions<TModel> {
	select?: FetchSimpleSelect<TModel>;
}

export interface FetchCreateDataOptions<TModel, F extends FetchableOperations = FetchableOperations> {
	createData?: Prisma.TypeMap["model"][RetrieveModelName<TModel>]["operations"][F extends "findMany"
		? "createMany"
		: "create"]["args"]["data"];
}

export interface FetchValidationOptions {
	validationError?: boolean;
}

export interface IWithSave<TModel, Doc = Typings.Database.Prisma.RetrieveModelDocument<RetrieveModelName<TModel>>> {
	doc: Doc;
	save: <T extends FetchSimpleSelect<TModel>>(
		select?: T
	) => Promise<Typings.Database.SimpleSelectOutput<RetrieveModelName<TModel>, T>>;
}
