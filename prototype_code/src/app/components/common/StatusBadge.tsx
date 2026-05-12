interface StatusBadgeProps {
  status: 'normal' | 'stop-purchase' | 'stop-use' | 'draft' | 'pending' | 'approved' | 'rejected';
  children: React.ReactNode;
}

const statusConfig = {
  normal: 'bg-green-100 text-green-700',
  'stop-purchase': 'bg-orange-100 text-orange-700',
  'stop-use': 'bg-gray-100 text-gray-700',
  draft: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export function StatusBadge({ status, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs ${statusConfig[status]}`}>
      {children}
    </span>
  );
}
