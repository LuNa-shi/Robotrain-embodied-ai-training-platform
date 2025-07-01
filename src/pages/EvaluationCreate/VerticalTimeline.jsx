import React from 'react';
import timelineStyles from '@/styles/VerticalTimeline.module.css';

const VerticalTimeline = ({ steps, currentStep }) => {
  return (
    <div className={timelineStyles.verticalTimeline}>
      {steps.map((step, idx) => {
        let stepClass = timelineStyles.timelineStep;
        if (idx < currentStep) stepClass += ' ' + timelineStyles.completed;
        if (idx === currentStep) stepClass += ' ' + timelineStyles.active;
        return (
          <div
            className={stepClass}
            key={idx}
            style={{ animationDelay: `${idx * 0.12}s` }}
          >
            <div className={timelineStyles.timelineIcon}>{step.icon}</div>
            <div className={timelineStyles.timelineContent}>
              <div className={timelineStyles.timelineTitle}>{step.title}</div>
              <div className={timelineStyles.timelineDesc}>{step.desc}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default VerticalTimeline; 