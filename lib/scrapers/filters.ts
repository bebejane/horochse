import { foldName, isCancelled, isClubNight } from "./text";

const NON_CONCERT = new RegExp(
  "\\b(" +
    "teater|pjäs|pjas|föreställning|forestallning|musikal|standup|stand-up|" +
    "komedi|comedy|humor|föredrag|foredrag|bokrelease|boksamtal|bokcirkel|" +
    "afterwork|after[\\s-]?work|efter jobbet|brunch|konferens|hockey|fotboll|innebandy|" +
    "sport\\b|match\\b|utställning|utstallning|vernissage|burlesque|krogshow|julshow|" +
    "cirkusshow|after[\\s-]?party|klubbkväll|klubbkvall|\\baw\\b|out of office" +
    ")\\b",
  "i",
);

const YES_CONCERT = new RegExp(
  "\\b(" +
    "konsert|concert|live|jazz|gig|turné|turne|tour|orkester|filharmon|" +
    "symphony|recital|kör\\b|kor\\b|opera|choir|band|spelar|releasekonsert" +
    ")\\b",
  "i",
);

export function isConcert(title: string, text = "", category = "", strict = false): boolean {
  title = foldName(title);
  text = foldName(text);
  category = foldName(category);
  if (!title) return false;
  if (isClubNight(title, text)) return false;
  if (isCancelled(title, text)) return false;
  const blob = `${title} ${text} ${category}`;
  const cat = category.toLowerCase();
  if (cat.includes("sport")) return false;
  if (/humor|samtal/.test(cat) && !cat.includes("musik")) return false;
  if (NON_CONCERT.test(title) && !YES_CONCERT.test(title)) return false;
  if (strict && !YES_CONCERT.test(blob) && !cat.includes("musik")) return false;
  return true;
}
