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
