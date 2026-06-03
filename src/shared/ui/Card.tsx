interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={`glass-card rounded-card ${className}`}>
      {children}
    </div>
  );
}
