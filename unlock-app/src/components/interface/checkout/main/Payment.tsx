import { CheckoutService } from './checkoutMachine'
import { RiExternalLinkLine as ExternalLinkIcon } from 'react-icons/ri'
import { Connected } from '../Connected'
import { useConfig } from '~/utils/withConfig'
import { useActor } from '@xstate/react'
import { useAuth } from '~/contexts/AuthenticationContext'
import { PoweredByUnlock } from '../PoweredByUnlock'
import { Stepper } from '../Stepper'
import { RiArrowRightLine as RightArrowIcon } from 'react-icons/ri'
import { useQuery } from '@tanstack/react-query'
import { getFiatPricing } from '~/hooks/useCards'
import { lockTickerSymbol } from '~/utils/checkoutLockUtils'
import { Fragment } from 'react'
import {
  RiVisaLine as VisaIcon,
  RiMastercardLine as MasterCardIcon,
} from 'react-icons/ri'
import { getAccountTokenBalance } from '~/hooks/useAccount'
import { useCheckoutSteps } from './useCheckoutItems'
import { useWeb3Service } from '~/utils/withWeb3Service'
import { CryptoIcon } from '@unlock-protocol/crypto-icon'
import { useIsClaimable } from '~/hooks/useIsClaimable'
interface Props {
  injectedProvider: unknown
  checkoutService: CheckoutService
}

interface AmountBadgeProps {
  symbol: string
  amount: string
}

const AmountBadge = ({ symbol, amount }: AmountBadgeProps) => {
  return (
    <div className="flex items-center gap-x-1 px-2 py-0.5 rounded border font-medium text-sm">
      {amount + ' '} {symbol.toUpperCase()}
      <CryptoIcon symbol={symbol} />
    </div>
  )
}

export function Payment({ injectedProvider, checkoutService }: Props) {
  const [state, send] = useActor(checkoutService)
  const config = useConfig()
  const { quantity, recipients } = state.context
  const lock = state.context.lock!
  const { account, isUnlockAccount } = useAuth()
  const baseSymbol = config.networks[lock.network].nativeCurrency.symbol
  const symbol = lockTickerSymbol(lock, baseSymbol)
  const web3Service = useWeb3Service()
  const { isLoading, data: fiatPricing } = useQuery(
    ['fiat', quantity, lock.address, lock.network],
    async () => {
      const pricing = await getFiatPricing(
        config,
        lock.address,
        lock.network,
        quantity
      )
      return pricing
    }
  )

  const { isLoading: isClaimableLoading, isClaimable } = useIsClaimable({
    lockAddress: lock.address,
    network: lock.network,
  })

  const { isLoading: isWalletInfoLoading, data: walletInfo } = useQuery(
    ['balance', account, lock.address],
    async () => {
      const [balance, networkBalance] = await Promise.all([
        getAccountTokenBalance(
          web3Service,
          account!,
          lock.currencyContractAddress,
          lock.network
        ),
        getAccountTokenBalance(web3Service, account!, null, lock.network),
      ])

      const isGasPayable = parseFloat(networkBalance) > 0 // TODO: improve actual calculation

      const isPayable = isGasPayable
      /** Note: we won't really know if user can afford because there could be discounts... */
      /* userCanAffordKey(lock, balance, recipients.length) && isGasPayable */

      const options = {
        balance,
        networkBalance,
        isPayable,
        isGasPayable,
      }

      return options
    }
  )

  const isWaiting = isLoading || isClaimableLoading || isWalletInfoLoading

  const networkConfig = config.networks[lock.network]

  const isReceiverAccountOnly =
    recipients.length <= 1 &&
    recipients[0]?.toLowerCase() === account?.toLowerCase()

  const enableCreditCard = !!fiatPricing?.creditCardEnabled

  const enableCrypto = !isUnlockAccount || !!walletInfo?.isPayable

  const forceClaim = lock.network === 42161

  const enableClaim =
    !!isClaimable &&
    !isClaimableLoading &&
    isReceiverAccountOnly &&
    (!walletInfo?.isPayable || forceClaim)

  const stepItems = useCheckoutSteps(checkoutService)

  const allDisabled = [enableCreditCard, enableClaim, enableCrypto].every(
    (item) => !item
  )

  const keyPrice = Number(parseFloat(lock.keyPrice)).toLocaleString()
  return (
    <Fragment>
      <Stepper position={4} service={checkoutService} items={stepItems} />
      <main className="h-full p-6 overflow-auto">
        {isWaiting ? (
          <div className="space-y-6">
            <div className="w-full h-24 rounded-lg bg-zinc-50 animate-pulse" />
            <div className="w-full h-24 rounded-lg bg-zinc-50 animate-pulse" />
          </div>
        ) : (
          <div className="space-y-6">
            {enableCrypto && (
              <button
                disabled={!walletInfo?.isPayable}
                onClick={(event) => {
                  event.preventDefault()
                  send({
                    type: 'SELECT_PAYMENT_METHOD',
                    payment: {
                      method: 'crypto',
                    },
                  })
                }}
                className="grid w-full p-4 space-y-2 text-left border border-gray-400 rounded-lg shadow cursor-pointer group hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
              >
                <div className="flex justify-between w-full">
                  <h3 className="font-bold"> Pay via cryptocurrency </h3>
                  <AmountBadge amount={keyPrice} symbol={symbol} />
                </div>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center w-full text-sm text-left text-gray-500">
                    Your balance of {symbol.toUpperCase()} on{' '}
                    {networkConfig.name}:{' ~'}
                    {parseFloat(walletInfo?.balance).toFixed(3)}{' '}
                  </div>
                  <RightArrowIcon
                    className="transition-transform duration-300 ease-out group-hover:fill-brand-ui-primary group-hover:translate-x-1 group-disabled:translate-x-0 group-disabled:transition-none group-disabled:group-hover:fill-black"
                    size={20}
                  />
                </div>
                <div className="inline-flex text-sm text-start">
                  {!walletInfo?.isGasPayable &&
                    `You don't have enough ${networkConfig.nativeCurrency.symbol} for gas fee.`}
                </div>
              </button>
            )}
            {enableCreditCard && (
              <button
                onClick={(event) => {
                  event.preventDefault()
                  send({
                    type: 'SELECT_PAYMENT_METHOD',
                    payment: {
                      method: 'card',
                    },
                  })
                }}
                className="flex flex-col w-full p-4 space-y-2 border border-gray-400 rounded-lg shadow cursor-pointer group hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
              >
                <div className="flex items-center justify-between w-full">
                  <h3 className="font-bold"> Pay via card </h3>
                  <div className="flex items-center gap-x-1 px-2 py-0.5 rounded border font-medium text-sm">
                    <VisaIcon size={18} />
                    <MasterCardIcon size={18} />
                  </div>
                </div>
                <div className="flex items-center justify-between w-full">
                  <div className="text-sm text-left text-gray-500">
                    Use cards, Google Pay, or Apple Pay. <br />
                    <span className="text-xs">Additional fees may apply</span>
                  </div>
                  <RightArrowIcon
                    className="transition-transform duration-300 ease-out group-hover:fill-brand-ui-primary group-hover:translate-x-1 group-disabled:translate-x-0 group-disabled:transition-none group-disabled:group-hover:fill-black"
                    size={20}
                  />
                </div>
              </button>
            )}
            {enableClaim && (
              <button
                onClick={(event) => {
                  event.preventDefault()
                  send({
                    type: 'SELECT_PAYMENT_METHOD',
                    payment: {
                      method: 'claim',
                    },
                  })
                }}
                className="flex flex-col w-full p-4 space-y-2 border border-gray-400 rounded-lg shadow cursor-pointer group hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
              >
                <h3 className="font-bold"> Claim membership for free </h3>
                <div className="flex items-center justify-between w-full">
                  <div className="text-sm text-left text-gray-500">
                    We will airdrop this free membership to you!
                  </div>
                  <div className="flex items-center justify-end">
                    <RightArrowIcon
                      className="transition-transform duration-300 ease-out group-hover:fill-brand-ui-primary group-hover:translate-x-1 group-disabled:translate-x-0 group-disabled:transition-none group-disabled:group-hover:fill-black"
                      size={20}
                    />
                  </div>
                </div>
              </button>
            )}

            {allDisabled && (
              <div className="text-sm">
                <p className="mb-4">
                  Credit card payments have not been enabled for this
                  membership.
                </p>
                {isUnlockAccount && (
                  <>
                    <p className="mb-4">
                      Ready to get your own wallet to purchase this membership
                      with cryptocurrency?{' '}
                      <a
                        href="https://ethereum.org/en/wallets/find-wallet/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-gray-500 underline"
                      >
                        <span>Click here</span>
                        <ExternalLinkIcon />
                      </a>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="grid items-center px-6 pt-6 border-t">
        <Connected
          service={checkoutService}
          injectedProvider={injectedProvider}
        />
        <PoweredByUnlock />
      </footer>
    </Fragment>
  )
}
