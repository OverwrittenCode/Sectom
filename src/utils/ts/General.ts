import type {
	BeAnObject,
	IObjectWithTypegooseFunction
} from "@typegoose/typegoose/lib/types";
import mongoose, { Types } from "mongoose";

export type ModelUpdateProperties<I> = {
	[K in keyof Omit<I, "_id" | "__v">]?: I[K];
};

export type MongooseDocumentType<T = any> = mongoose.Document<
	unknown,
	BeAnObject,
	T
> &
	Omit<
		T & {
			_id: Types.ObjectId;
		},
		"typegooseName"
	> &
	IObjectWithTypegooseFunction;

export type ClassPropertyNames<T> = {
	[K in keyof T]: T[K] extends Function ? never : K;
}[keyof T] extends infer U
	? U
	: never;

export type FunctionPropertyNames<T> = {
	[K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export type NonFunctionPropertyNames<T> = {
	[K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

export type FilteredKeys<T> = {
	[K in keyof T as T[K] extends Function ? never : K]: T[K];
};

export type TitleCase<T extends string> =
	T extends `${infer First}${infer Rest}`
		? `${Uppercase<First>}${Lowercase<Rest>}`
		: never;

export type TitleCaseEnum<T extends string> = {
	[P in T as Uppercase<P>]: TitleCase<P>;
};

export type NonNullProperties<T> = {
	[K in keyof T]: T[K] extends null | undefined ? never : K;
}[keyof T];

export type NonNullResultKeys<T> = NonNullProperties<T>;

export type NonNullResultValues<T> = Exclude<T[NonNullResultKeys<T>], null>;

export type PromiseOrValue<T> = T extends Promise<any> ? T : Promise<T>;

export type Unwrapped<T> = T extends Promise<infer U> ? U : T;
export type UnwrappedOrPromise<T> = Unwrapped<T> | Promise<Unwrapped<T>>;

export type ConditionalAwaited<T> = T extends Promise<infer U> ? U : T;
