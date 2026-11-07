import Image from "next/image";
import addContact from "@/assets/calendar/add-contact.svg";
import chevron from "@/assets/calendar/chevron.svg";
import close from "@/assets/calendar/close.svg";
import date from "@/assets/calendar/date.svg";
import decrement from "@/assets/calendar/decrement.svg";
import increment from "@/assets/calendar/increment.svg";
import next from "@/assets/calendar/next.svg";
import oven from "@/assets/calendar/oven.svg";
import prepTable from "@/assets/calendar/prep-table.svg";
import previous from "@/assets/calendar/previous.svg";
import removeGreen from "@/assets/calendar/remove-green.svg";
import removePurple from "@/assets/calendar/remove-purple.svg";
import time from "@/assets/calendar/time.svg";

const icons = {
  addContact,
  chevron,
  close,
  date,
  decrement,
  increment,
  next,
  oven,
  prepTable,
  previous,
  removeGreen,
  removePurple,
  time,
};
export function CalendarIcon({ name }: { name: keyof typeof icons }) {
  return <Image src={icons[name]} alt="" aria-hidden="true" />;
}
