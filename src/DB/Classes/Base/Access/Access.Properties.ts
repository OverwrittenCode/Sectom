import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";

export default class AccessProperties
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Base.Access.Properties
{
  @prop({ type: String })
  public staff?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public channels?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public roles?: mongoose.Types.Array<string>;

  @prop({ type: String })
  public users?: mongoose.Types.Array<string>;
}
