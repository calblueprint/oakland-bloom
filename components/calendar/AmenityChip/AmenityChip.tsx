import { amenityLabel } from "@/lib/bookingRequest";
import { CalendarIcon } from "../CalendarIcon/CalendarIcon";
import { Chip } from "./styles";

export function AmenityChip({
  amenity,
  onRemove,
}: {
  amenity: string;
  onRemove?: () => void;
}) {
  return (
    <Chip $oven={amenity === "oven"}>
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
    </Chip>
  );
}
