import type { VenueFetch } from "./types";
import { fetch as debaser } from "./venues/debaser";
import { fetch as nalen } from "./venues/nalen";
import { fetch as fallan } from "./venues/fallan";
import { fetch as slaktkyrkan } from "./venues/slaktkyrkan";
import { fetch as hus7 } from "./venues/hus7";
import { fetch as kollektivetlivet } from "./venues/kollektivetlivet";
import { fetch as sodrateatern } from "./venues/sodrateatern";
import { fetch as berns } from "./venues/berns";
import { fetch as cirkus } from "./venues/cirkus";
import { fetch as kulturhuset } from "./venues/kulturhuset";
import { fetch as hartwig } from "./venues/hartwig";
import { fetch as annexet } from "./venues/annexet";
import { fetch as hovet } from "./venues/hovet";
import { fetch as aviciiarena } from "./venues/aviciiarena";
import { fetch as trearena } from "./venues/trearena";
import { fetch as strawberryarena } from "./venues/strawberryarena";
import { fetch as konserthuset } from "./venues/konserthuset";
import { fetch as berwaldhallen } from "./venues/berwaldhallen";
import { fetch as fasching } from "./venues/fasching";
import { fetch as stampen } from "./venues/stampen";
import { fetch as glennmillercafe } from "./venues/glennmillercafe";
import { fetch as petsoundsbar } from "./venues/petsoundsbar";
import { fetch as reimersholme } from "./venues/reimersholme";
import { fetch as riche } from "./venues/riche";
import { fetch as landet } from "./venues/landet";
import { fetch as encore } from "./venues/encore";
import { fetch as bioaspen } from "./venues/bioaspen";
import { fetch as scalateatern } from "./venues/scalateatern";
import { fetch as gotalejon } from "./venues/gotalejon";
import { fetch as bagarmossen } from "./venues/bagarmossen";
import { fetch as kmh } from "./venues/kmh";
import { fetch as ericericsonhallen } from "./venues/ericericsonhallen";
import { fetch as gronalund } from "./venues/gronalund";
import { fetch as fylkingen } from "./venues/fylkingen";
import { fetch as ronnells } from "./venues/ronnells";
import { fetch as larryscorner } from "./venues/larryscorner";

export const SOURCES: [string, VenueFetch][] = [
  ["debaser", debaser],
  ["nalen", nalen],
  ["fallan", fallan],
  ["slaktkyrkan", slaktkyrkan],
  ["hus7", hus7],
  ["kollektivetlivet", kollektivetlivet],
  ["sodrateatern", sodrateatern],
  ["berns", berns],
  ["cirkus", cirkus],
  ["kulturhuset", kulturhuset],
  ["hartwig", hartwig],
  ["annexet", annexet],
  ["hovet", hovet],
  ["aviciiarena", aviciiarena],
  ["trearena", trearena],
  ["strawberryarena", strawberryarena],
  ["konserthuset", konserthuset],
  ["berwaldhallen", berwaldhallen],
  ["fasching", fasching],
  ["stampen", stampen],
  ["glennmillercafe", glennmillercafe],
  ["petsoundsbar", petsoundsbar],
  ["reimersholme", reimersholme],
  ["riche", riche],
  ["landet", landet],
  ["encore", encore],
  ["bioaspen", bioaspen],
  ["scalateatern", scalateatern],
  ["gotalejon", gotalejon],
  ["bagarmossen", bagarmossen],
  ["kmh", kmh],
  ["ericericsonhallen", ericericsonhallen],
  ["gronalund", gronalund],
  ["fylkingen", fylkingen],
  ["ronnells", ronnells],
  ["larryscorner", larryscorner],
];
