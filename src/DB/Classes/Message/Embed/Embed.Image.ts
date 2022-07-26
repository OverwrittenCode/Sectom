import { prop } from "@typegoose/typegoose";
import {
  APIEmbedImage,
  APIEmbedThumbnail,
  APIEmbedVideo,
} from "discord-api-types/payloads/v9/channel";
import { Namespaces } from "@DB/index";
import DataLog from "../../Base/Base.DataLog";

export class MessageEmbedImage extends DataLog implements APIEmbedImage {
  @prop({ required: true })
  public url!: string;

  @prop()
  public height?: number;

  @prop()
  public width?: number;
}

export class MessageEmbedThumbnail
  extends MessageEmbedImage
  implements Namespaces.Interfaces.Message.Embed.Thumbnail {}

export class MessageEmbedVideo
  extends MessageEmbedImage
  implements Namespaces.Interfaces.Message.Embed.Video {}
