import { prop } from "@typegoose/typegoose";
import { APIEmbedField } from "discord-api-types/payloads/v9/channel";
import DataLog from "../../Base/Base.DataLog";

export default class MessageEmbedField
  extends DataLog
  implements APIEmbedField
{
  @prop({ required: true, maxlength: 256 })
  public name: string;

  @prop({ required: true, maxlength: 1024 })
  public value: string;

  @prop()
  public inline?: boolean;
}
