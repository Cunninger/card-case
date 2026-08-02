package com.cardcabinet.app

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class CardCaseSecureStorageModule(
  private val appContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(appContext) {
  override fun getName() = "CardCaseSecureStorage"

  @ReactMethod
  fun getItem(key: String, promise: Promise) {
    try {
      val encryptedValue = preferences().getString(key, null)
      promise.resolve(encryptedValue?.let(::decrypt))
    } catch (_: Exception) {
      promise.reject("SECURE_STORAGE_READ_FAILED", "无法读取本机加密数据")
    }
  }

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) {
    try {
      val persisted = preferences().edit().putString(key, encrypt(value)).commit()
      if (persisted) promise.resolve(null) else promise.reject("SECURE_STORAGE_WRITE_FAILED", "无法写入本机加密数据")
    } catch (_: Exception) {
      promise.reject("SECURE_STORAGE_WRITE_FAILED", "无法写入本机加密数据")
    }
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) {
    try {
      val removed = preferences().edit().remove(key).commit()
      if (removed) promise.resolve(null) else promise.reject("SECURE_STORAGE_REMOVE_FAILED", "无法移除本机加密数据")
    } catch (_: Exception) {
      promise.reject("SECURE_STORAGE_REMOVE_FAILED", "无法移除本机加密数据")
    }
  }

  private fun preferences() = appContext.getSharedPreferences(PREFERENCES_NAME, 0)

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE).apply {
      init(
        KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256)
          .build(),
      )
    }.generateKey()
  }

  private fun encrypt(value: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
    val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(cipher.iv + ciphertext, Base64.NO_WRAP)
  }

  private fun decrypt(value: String): String {
    val payload = Base64.decode(value, Base64.NO_WRAP)
    require(payload.size > IV_LENGTH_BYTES) { "Invalid encrypted payload" }
    val iv = payload.copyOfRange(0, IV_LENGTH_BYTES)
    val ciphertext = payload.copyOfRange(IV_LENGTH_BYTES, payload.size)
    val cipher = Cipher.getInstance(TRANSFORMATION).apply {
      init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv))
    }
    return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
  }

  private companion object {
    const val PREFERENCES_NAME = "card_case_secure_storage_v1"
    const val ANDROID_KEY_STORE = "AndroidKeyStore"
    const val KEY_ALIAS = "card_case_storage_key_v1"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val IV_LENGTH_BYTES = 12
    const val GCM_TAG_LENGTH_BITS = 128
  }
}
