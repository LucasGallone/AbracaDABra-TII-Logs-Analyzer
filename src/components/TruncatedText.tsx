import React, { useRef, useState, useEffect } from 'react';
import { Tooltip } from './Tooltip';

interface TruncatedTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
  lines?: number;
  className?: string;
}

export function TruncatedText({ text, lines = 1, className, ...props }: TruncatedTextProps) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        const { scrollHeight, clientHeight, scrollWidth, clientWidth } = textRef.current;
        setIsTruncated(scrollHeight > clientHeight + 2 || scrollWidth > clientWidth + 2);
      }
    };

    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [text, lines, className]);

  const clampClass = lines === 1 ? 'truncate block' : lines === 2 ? 'line-clamp-2' : lines === 3 ? 'line-clamp-3' : 'line-clamp-4';
  
  const Element = (
    <span
      ref={textRef}
      className={`${className || ''} ${clampClass}`}
      {...props}
    >
      {text}
    </span>
  );

  if (isTruncated) {
    return (
      <Tooltip content={text}>
        {Element}
      </Tooltip>
    );
  }

  return Element;
}
