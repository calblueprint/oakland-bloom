import { amenityLabel } from "@/lib/bookingRequest";
import { CalendarIcon } from "./CalendarIcon";

export function AmenityChip({
  amenity,
  onRemove,
}: {
  amenity: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className={`amenity-chip ${amenity === "oven" ? "amenity-chip--oven" : ""}`}
    >
      <CalendarIcon name={amenity === "oven" ? "oven" : "prepTable"} />
      {amenityLabel(amenity)}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${amenityLabel(amenity)}`}
        >
          <CalendarIcon
            name={amenity === "oven" ? "removePurple" : "removeGreen"}
          />
        </button>
      )}
    </span>
  );
}
