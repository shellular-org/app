package io.foxbiz.shellular;

import android.app.Application;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class Shellular extends Application {
    private static Shellular instance;

    private ExecutorService executorService;
    private ExecutorService executorServiceSingle;

    public static Shellular getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        executorService = Executors.newFixedThreadPool(4);
        executorServiceSingle = Executors.newSingleThreadExecutor();
    }

    public ExecutorService getThreadPool() {
        return executorService;
    }

    public ExecutorService getThreadPoolSingle() {
        return executorServiceSingle;
    }

    public void shutdown() {
        executorService.shutdown();
        executorServiceSingle.shutdown();
        // terminate app
        System.exit(0);
    }

    public void restart() {
        shutdown();
        executorService = Executors.newFixedThreadPool(4);
        executorServiceSingle = Executors.newSingleThreadExecutor();
    }

    @Override
    public void onTerminate() {
        super.onTerminate();
        shutdown();
    }
}
