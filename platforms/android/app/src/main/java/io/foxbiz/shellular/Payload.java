package io.foxbiz.shellular;

public class Payload {
    public static int SUCCESS = 0;
    public static int ERROR = 1;
    boolean keepAlive = false;
    Object data = null;
    int type = SUCCESS;

    public Payload(Object data, boolean keepAlive) {
        this.keepAlive = keepAlive;
        this.data = data;
    }

    public Payload(Object data) {
        this.data = data;
    }

    public Payload error(){
        this.type = ERROR;
        return this;
    }
}
