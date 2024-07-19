import { instanceCachingFactory } from "tsyringe";

import type { FactoryFunction, InjectionToken } from "tsyringe";
import type constructor from "tsyringe/dist/typings/types/constructor.js";

export function getInstanceCashingSingletonFactory<T>(clazz: InjectionToken<T>): FactoryFunction<T> {
	return instanceCachingFactory<T>((c) => {
		if (!c.isRegistered(clazz)) {
			c.registerSingleton(clazz as constructor<T>);
		}

		return c.resolve(clazz);
	});
}
