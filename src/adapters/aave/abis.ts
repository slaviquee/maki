// Aave V3 Pool — minimal ABI for reads
export const aavePoolAbi = [
  {
    type: 'function',
    name: 'getUserAccountData',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const

// Aave V3 UI Pool Data Provider — for per-asset positions
export const aaveUiPoolDataProviderAbi = [
  {
    type: 'function',
    name: 'getUserReservesData',
    stateMutability: 'view',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'underlyingAsset', type: 'address' },
          { name: 'scaledATokenBalance', type: 'uint256' },
          { name: 'usageAsCollateralEnabledOnUser', type: 'bool' },
          { name: 'stableBorrowRate', type: 'uint256' },
          { name: 'scaledVariableDebt', type: 'uint256' },
          { name: 'principalStableDebt', type: 'uint256' },
          { name: 'stableBorrowLastUpdateTimestamp', type: 'uint256' },
        ],
      },
      { name: '', type: 'uint8' },
    ],
  },
] as const

// Aave V3 Rewards Controller — for claiming
export const aaveRewardsControllerAbi = [
  {
    type: 'function',
    name: 'getUserRewards',
    stateMutability: 'view',
    inputs: [
      { name: 'assets', type: 'address[]' },
      { name: 'user', type: 'address' },
      { name: 'reward', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimAllRewards',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'assets', type: 'address[]' },
      { name: 'to', type: 'address' },
    ],
    outputs: [
      { name: 'rewardsList', type: 'address[]' },
      { name: 'claimedAmounts', type: 'uint256[]' },
    ],
  },
] as const
