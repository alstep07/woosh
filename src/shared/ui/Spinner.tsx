const sizes = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-2",
};

export function Spinner({ size = "lg" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`${sizes[size]} border-blue-primary border-t-transparent rounded-full animate-spin`} />
  );
}
