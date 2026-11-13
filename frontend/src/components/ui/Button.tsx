import React from 'react';
import { Btn, type BtnVariant } from '../gr';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isFullWidth?: boolean;
}

const VARIANT_MAP: Record<NonNullable<ButtonProps['variant']>, BtnVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  success: 'success',
  danger: 'danger',
  warning: 'soft',
  outline: 'secondary',
  ghost: 'ghost',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading,
  loadingText,
  leftIcon,
  rightIcon,
  isFullWidth,
  ...props
}) => (
  <Btn
    variant={VARIANT_MAP[variant]}
    size={size}
    block={isFullWidth}
    isLoading={isLoading}
    loadingText={loadingText}
    leftIcon={leftIcon}
    rightIcon={rightIcon}
    {...props}
  />
);

export default Button;
