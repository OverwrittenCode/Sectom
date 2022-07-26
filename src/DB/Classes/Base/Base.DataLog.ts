import { prop } from "@typegoose/typegoose";
import { Base, TimeStamps } from "@typegoose/typegoose/lib/defaultClasses";
import UpdateLog from "./Base.UpdateLog";

export default class DataLog extends TimeStamps implements Partial<Base<string>> {
  @prop()
  public _id?: string;

  @prop()
  public id?: string;

  @prop({ type: UpdateLog, required: true })
  public updatedBy: UpdateLog;
}
