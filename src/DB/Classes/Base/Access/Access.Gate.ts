import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import AccessProperties from "./Access.Properties";

export default class AccessGate
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Base.Access.Gate
{
  @prop({ type: AccessProperties })
  public blacklist?: AccessProperties;

  @prop({ type: AccessProperties })
  public whitelist?: AccessProperties;
}
