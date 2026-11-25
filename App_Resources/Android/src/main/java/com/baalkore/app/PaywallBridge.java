package com.baalkore.app;

import android.app.Activity;
import android.content.Context;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Thread-safe Google Play Billing v7 bridge for NativeScript.
 * All BillingClient callbacks execute on Google Play background binder threads and update volatile/concurrent
 * fields here so the JS main thread can poll state safely without crossing V8 isolate threads.
 */
public final class PaywallBridge implements PurchasesUpdatedListener {
    private final Context appContext;
    private final BillingClient client;
    private final Set<String> ownedProducts = Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());
    private final Map<String, ProductDetails> productCache = new ConcurrentHashMap<>();
    private final Map<String, String> priceCache = new ConcurrentHashMap<>();

    private volatile boolean connected = false;
    private volatile boolean connecting = false;
    private volatile String purchaseState = "IDLE";
    private volatile int lastResponseCode = BillingClient.BillingResponseCode.OK;
    private volatile String lastDebugMessage = "";

    public PaywallBridge(Context context) {
        this.appContext = context.getApplicationContext();
        PendingPurchasesParams pendingParams = PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build();
        this.client = BillingClient.newBuilder(this.appContext)
                .setListener(this)
                .enablePendingPurchases(pendingParams)
                .build();
        connect();
    }

    public synchronized void connect() {
        if (connected || connecting) return;
        connecting = true;
        try {
            client.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(BillingResult result) {
                    connecting = false;
                    lastResponseCode = result.getResponseCode();
                    lastDebugMessage = result.getDebugMessage() != null ? result.getDebugMessage() : "";
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        connected = true;
                        refreshPurchases();
                    } else {
                        connected = false;
                    }
                }

                @Override
                public void onBillingServiceDisconnected() {
                    connecting = false;
                    connected = false;
                }
            });
        } catch (Exception e) {
            connecting = false;
            connected = false;
            lastDebugMessage = e.toString();
        }
    }

    public boolean isReady() {
        return connected && client.isReady();
    }

    /** True only when the APK/AAB is built with android:debuggable="true" (never true in Play Store release builds). */
    public boolean isDebugBuild() {
        return (appContext.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    public int getLastResponseCode() {
        return lastResponseCode;
    }

    public String getLastDebugMessage() {
        return lastDebugMessage;
    }

    public String getPurchaseState() {
        return purchaseState;
    }

    public void resetPurchaseState() {
        purchaseState = "IDLE";
    }

    /** Comma-separated list of owned Google Play In-App product IDs (e.g. "parasha_bereshit,parasha_noach"). */
    public String getOwnedProductsCsv() {
        if (ownedProducts.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (String id : ownedProducts) {
            if (sb.length() > 0) sb.append(',');
            sb.append(id);
        }
        return sb.toString();
    }

    public String getFormattedPrice(String productId) {
        String p = priceCache.get(productId);
        return p != null && !p.isEmpty() ? p : "10.00 ₪";
    }

    /** Queries owned INAPP purchases from Google Play Store and acknowledges any unacknowledged purchase. */
    public void refreshPurchases() {
        if (!client.isReady()) {
            connect();
            return;
        }
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
        client.queryPurchasesAsync(params, (billingResult, purchases) -> {
            lastResponseCode = billingResult.getResponseCode();
            lastDebugMessage = billingResult.getDebugMessage() != null ? billingResult.getDebugMessage() : "";
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                for (Purchase purchase : purchases) {
                    handlePurchase(purchase);
                }
            }
        });
    }

    /** Pre-fetches product details (price/title) from Google Play for a list of product IDs. */
    public void queryProductsCsv(String csvProductIds) {
        if (!client.isReady() || csvProductIds == null || csvProductIds.isEmpty()) return;
        String[] parts = csvProductIds.split(",");
        List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        for (String raw : parts) {
            String pid = raw.trim();
            if (!pid.isEmpty()) {
                productList.add(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(pid)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build());
            }
        }
        if (productList.isEmpty()) return;
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build();
        client.queryProductDetailsAsync(params, (billingResult, queryResult) -> {
            List<ProductDetails> detailsList = queryResult != null ? queryResult.getProductDetailsList() : null;
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && detailsList != null) {
                for (ProductDetails pd : detailsList) {
                    productCache.put(pd.getProductId(), pd);
                    ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
                    if (offer != null && offer.getFormattedPrice() != null) {
                        priceCache.put(pd.getProductId(), offer.getFormattedPrice());
                    }
                }
            }
        });
    }

    /**
     * Launches the Google Play In-App Purchase bottom sheet for `productId`.
     * Updates `purchaseState` throughout the lifecycle so JS can poll without cross-thread callbacks.
     */
    public void launchPurchase(final Activity activity, final String productId) {
        if (activity == null) {
            purchaseState = "ERROR:NO_ACTIVITY";
            return;
        }
        purchaseState = "LAUNCHING:" + productId;
        if (!client.isReady()) {
            connect();
            purchaseState = "BILLING_UNAVAILABLE:" + productId;
            return;
        }

        ProductDetails cached = productCache.get(productId);
        if (cached != null) {
            launchBillingFlowOnUiThread(activity, cached, productId);
            return;
        }

        List<QueryProductDetailsParams.Product> list = Collections.singletonList(
                QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(productId)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()
        );
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(list)
                .build();

        client.queryProductDetailsAsync(params, (billingResult, queryResult) -> {
            lastResponseCode = billingResult.getResponseCode();
            lastDebugMessage = billingResult.getDebugMessage() != null ? billingResult.getDebugMessage() : "";
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                purchaseState = "ERROR:" + billingResult.getResponseCode() + ":" + lastDebugMessage;
                return;
            }
            List<ProductDetails> detailsList = queryResult != null ? queryResult.getProductDetailsList() : null;
            if (detailsList == null || detailsList.isEmpty()) {
                // The product ID has not been created/activated in Google Play Console yet.
                purchaseState = "PRODUCT_NOT_IN_PLAY_CONSOLE:" + productId;
                return;
            }
            ProductDetails pd = detailsList.get(0);
            productCache.put(productId, pd);
            ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
            if (offer != null && offer.getFormattedPrice() != null) {
                priceCache.put(productId, offer.getFormattedPrice());
            }
            launchBillingFlowOnUiThread(activity, pd, productId);
        });
    }

    private void launchBillingFlowOnUiThread(final Activity activity, final ProductDetails pd, final String productId) {
        activity.runOnUiThread(() -> {
            try {
                BillingFlowParams.ProductDetailsParams productDetailsParams =
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(pd)
                                .build();
                BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(Collections.singletonList(productDetailsParams))
                        .build();
                BillingResult res = client.launchBillingFlow(activity, flowParams);
                lastResponseCode = res.getResponseCode();
                lastDebugMessage = res.getDebugMessage() != null ? res.getDebugMessage() : "";
                if (res.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    purchaseState = "DIALOG_OPEN:" + productId;
                } else if (res.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                    ownedProducts.add(productId);
                    purchaseState = "PURCHASED:" + productId;
                } else {
                    purchaseState = "ERROR:" + res.getResponseCode() + ":" + lastDebugMessage;
                }
            } catch (Exception e) {
                purchaseState = "ERROR:-1:" + e.toString();
            }
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        int code = billingResult.getResponseCode();
        lastResponseCode = code;
        lastDebugMessage = billingResult.getDebugMessage() != null ? billingResult.getDebugMessage() : "";
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase p : purchases) {
                handlePurchase(p);
            }
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            refreshPurchases();
            purchaseState = "ALREADY_OWNED";
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            purchaseState = "CANCELED";
        } else {
            purchaseState = "ERROR:" + code + ":" + lastDebugMessage;
        }
    }

    private void handlePurchase(Purchase purchase) {
        int state = purchase.getPurchaseState();
        if (state == Purchase.PurchaseState.PURCHASED) {
            for (String pid : purchase.getProducts()) {
                ownedProducts.add(pid);
                purchaseState = "PURCHASED:" + pid;
            }
            // Consume the reusable Parasha unlock token so Google Play acknowledges the payment AND allows
            // the user to purchase additional Parashot with the same `parasha_unlock` / `parasha_unlock_5ils` SKU.
            ConsumeParams consumeParams = ConsumeParams.newBuilder()
                    .setPurchaseToken(purchase.getPurchaseToken())
                    .build();
            client.consumeAsync(consumeParams, (billingResult, purchaseToken) -> {
                lastResponseCode = billingResult.getResponseCode();
            });
        } else if (state == Purchase.PurchaseState.PENDING) {
            purchaseState = "PENDING";
        }
    }
}
