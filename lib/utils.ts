import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind CSS classes with clsx and tailwind-merge.
 * This ensures that conflicting classes (e.g., p-4 vs p-8) are resolved correctly.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
