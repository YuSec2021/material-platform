import { CheckCircle, Circle, XCircle, Clock } from "lucide-react";

interface TimelineStep {
  title: string;
  approver?: string;
  time?: string;
  status: 'completed' | 'current' | 'pending' | 'rejected';
  rejectReason?: string;
}

interface ApprovalTimelineProps {
  steps: TimelineStep[];
}

export function ApprovalTimeline({ steps }: ApprovalTimelineProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-6">
      <h3 className="text-sm text-gray-700 mb-4">审批流程</h3>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                step.status === 'completed' ? 'bg-green-500' :
                step.status === 'current' ? 'bg-blue-500 animate-pulse' :
                step.status === 'rejected' ? 'bg-red-500' :
                'bg-gray-300'
              }`}>
                {step.status === 'completed' ? (
                  <CheckCircle className="w-6 h-6 text-white" />
                ) : step.status === 'rejected' ? (
                  <XCircle className="w-6 h-6 text-white" />
                ) : step.status === 'current' ? (
                  <Clock className="w-6 h-6 text-white" />
                ) : (
                  <Circle className="w-6 h-6 text-white" />
                )}
              </div>
              <div className="mt-2 text-center">
                <p className={`text-xs ${
                  step.status === 'pending' ? 'text-gray-500' : 'text-gray-900'
                }`}>
                  {step.title}
                </p>
                {step.approver && (
                  <p className="text-xs text-gray-500 mt-1">{step.approver}</p>
                )}
                {step.time && (
                  <p className="text-xs text-gray-400 mt-1">{step.time}</p>
                )}
                {step.rejectReason && (
                  <div className="mt-2 px-2 py-1 bg-red-50 rounded text-xs text-red-600">
                    {step.rejectReason}
                  </div>
                )}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${
                step.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
              }`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
