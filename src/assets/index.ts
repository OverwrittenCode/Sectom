import { loadImage } from "canvacord";
import { SRC_PATH } from "~/constants.js";

const imageArr = ["unknownImage", "leaderboardBackground"] as const;

export const assets = await imageArr.reduce(
	async (acc, str) => {
		const obj = await acc;

		return Object.assign(obj, { [str]: await loadImage(`${SRC_PATH}/assets/${str}.png`) });
	},
	Promise.resolve(
		{} as {
			[K in (typeof imageArr)[number]]: Awaited<ReturnType<typeof loadImage>>;
		}
	)
);
