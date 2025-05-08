import { Controller, Get, HTTPResult } from '@ajs/api/beta';
import { GetClient } from '@ajs/stripe/beta';

const product = {
  currency: 'eur',
  product_data: {
    name: 'Bepis Max',
    description: 'A bepis max for 5€, 100% organic, 100% natural, 100% delicious',
  },
  unit_amount: 500,
}

const transaction = {
  payment_method_types: ['card' as const],
  line_items: [
    {
      price_data: product,
      quantity: 1,
    },
  ],
  mode: 'payment' as const,
  success_url: 'http://localhost:5010/playground/success',
  cancel_url: 'http://localhost:5010/playground/cancel',
}

export class PlaygroundController extends Controller('/playground') {
  constructor() {
    super();
  }

  @Get('/checkout')
  async createCheckout() {
    console.log('createCheckout');
    const client = await GetClient();
    const session = await client.checkout.sessions.create(transaction);
    if (!session.url) {
      throw new Error('No checkout URL available');
    }
    const result = new HTTPResult(302, null);
    result.addHeader('Location', session.url);
    return result;
  }

  @Get('/success')
  async success() {
    return { message: 'success' };
  }

  @Get('/cancel')
  async cancel() {
    return { message: 'cancel' };
  }
}

export async function start(): Promise<void> {}

export function stop(): void {}

export function construct(): void {}

export function destroy(): void {}
