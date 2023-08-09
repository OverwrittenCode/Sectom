import type {
	BeAnObject,
	IObjectWithTypegooseFunction
} from "@typegoose/typegoose/lib/types";
import mongoose, { Types } from "mongoose";

export type ModelUpdateProperties<I> = {
	[K in keyof Omit<I, "_id" | "__v">]?: I[K];
};

export type TypegooseDocumentType<T = any> = mongoose.Document<
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

export type ClassType = { new (...args: any[]): {} };

export type UnionProperties<T, U> = {
	[K in keyof T as T[K] extends U ? K : never]: T[K];
};

export type UnionKeys<T, U> = keyof UnionProperties<T, U>;

export type OmitType<T, V> = {
	[K in keyof T as T[K] extends V ? never : K]: T[K];
};

export type DeepOmitType<T, V, PassiveObjectTypes = Date> = {
	[K in keyof T as T[K] extends V ? never : K]: T[K] extends object
		? T[K] extends Date | any[] | PassiveObjectTypes
			? T[K]
			: DeepOmitType<T[K], V, PassiveObjectTypes>
		: T[K];
};

export type TitleCase<T extends string> =
	T extends `${infer First}${infer Rest}`
		? `${Uppercase<First>}${Lowercase<Rest>}`
		: T;

export type Split<S extends string, D extends string> = string extends S
	? string[]
	: S extends ""
	? []
	: S extends `${infer T}${D}${infer U}`
	? [T, ...Split<U, D>]
	: S extends `${infer T}[${infer U}]${infer V}`
	? [T, U, ...Split<V, D>]
	: [S];

export type ObjectValues<T> = T[keyof T];

export type PromiseOrValue<T> = T extends Promise<any> ? T : Promise<T>;

export type Unwrapped<T> = T extends Promise<infer U> ? U : T;
export type UnwrappedOrPromise<T> = Unwrapped<T> | Promise<Unwrapped<T>>;

export type ConditionalAwaited<T> = T extends Promise<infer U> ? U : T;
