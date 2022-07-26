import { prop } from "@typegoose/typegoose";
import { APIEmbedAuthor } from "discord-api-types/payloads/v9/channel";
import DataLog from "../../Base/Base.DataLog";

export default class MessageEmbedAuthor
  extends DataLog
  implements APIEmbedAuthor
{
  @prop({ required: true, maxlength: 256 })
  public name: string;

  @prop()
  public url?: string;

  @prop()
  public icon_url?: string;
}
