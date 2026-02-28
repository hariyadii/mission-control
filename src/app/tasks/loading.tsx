export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex gap-4">
        <div className="bg-stone-100/50 rounded-lg h-8 w-24"></div>
        <div className="bg-stone-100/50 rounded-lg h-8 w-24"></div>
        <div className="bg-stone-100/50 rounded-lg h-8 w-24"></div>
      </div>
      <div className="bg-stone-100/30 rounded-lg h-64 w-full"></div>
      <div className="bg-stone-100/30 rounded-lg h-16 w-full"></div>
      <div className="bg-stone-100/30 rounded-lg h-16 w-full"></div>
      <div className="bg-stone-100/30 rounded-lg h-16 w-full"></div>
    </div>
  );
}
